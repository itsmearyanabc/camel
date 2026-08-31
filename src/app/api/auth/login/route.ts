import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { rateLimit, getRateLimitIdentifier } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(req: Request) {
  try {
    // Rate limiting: 5 attempts per 15 minutes per IP
    const identifier = getRateLimitIdentifier(req);
    const rateLimitResult = rateLimit(identifier, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
    });

    if (!rateLimitResult.success) {
      const resetInMinutes = Math.ceil((rateLimitResult.resetAt - Date.now()) / 60000);
      return NextResponse.json(
        { error: `Too many login attempts. Please try again in ${resetInMinutes} minutes.` },
        { status: 429 }
      );
    }

    const { username, password, turnstileToken } = await req.json();

    // 1. Bot verification (Cloudflare Turnstile)
    //
    // Checked before the password is looked at, so a bot spraying credentials
    // never reaches the database or the bcrypt comparison. `identifier` is the
    // real client IP resolved above and is passed to Cloudflare as a signal.
    const turnstile = await verifyTurnstile(turnstileToken, identifier);
    if (!turnstile.success) {
      return NextResponse.json({ error: turnstile.error }, { status: 400 });
    }

    // 2. Validate Inputs
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    // 3. Check DB User and Lock Status
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (user && user.lockUntil && user.lockUntil > new Date()) {
      const remainingMs = user.lockUntil.getTime() - Date.now();
      const remainingMins = Math.ceil(remainingMs / 60000);
      return NextResponse.json({ error: `Account locked. Try again in ${remainingMins} minutes.` }, { status: 403 });
    }

    // 4. Check for Env Admin Override
    // Trimmed because the id is typed into a login box: a trailing space left
    // behind while editing .env is invisible there and would silently stop
    // every admin login with no way to see why.
    const envAdminId = process.env.ADMIN_ID?.trim();
    const envAdminPassword = process.env.ADMIN_PASSWORD;
    const envAdminConfigured = Boolean(envAdminId && envAdminPassword);

    if (envAdminConfigured && username === envAdminId && password === envAdminPassword) {
      // Reset attempts if needed
      if (user && (user.failedLoginAttempts > 0 || user.lockUntil)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockUntil: null }
        });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(envAdminPassword!, salt);

      // Carry the existing admin row over to the new id instead of leaving it
      // behind. The row's uuid is what the wallet, the dispute read markers and
      // every other admin-owned record point at, so creating a fresh row for a
      // renamed ADMIN_ID strands all of it on an account nobody can log into
      // any more and hands the new admin an empty panel. Renaming keeps the
      // uuid — only the id and the password change, which is the whole intent
      // of editing ADMIN_ID. Nothing is deleted either way.
      //
      // Only a lone SUPERADMIN row is ever touched: the control panel cannot
      // grant that role (see api/admin/role-adjust, which rejects it), so such
      // a row exists only because a previous ADMIN_ID created it right here.
      if (!(await prisma.user.findUnique({ where: { username: envAdminId! } }))) {
        const priorAdmins = await prisma.user.findMany({ where: { role: "SUPERADMIN" } });
        if (priorAdmins.length === 1) {
          await prisma.user.update({
            where: { id: priorAdmins[0].id },
            data: { username: envAdminId! },
          });
        }
      }

      const superAdmin = await prisma.user.upsert({
        where: { username: envAdminId! },
        update: {
          passwordHash: passwordHash,
          role: "SUPERADMIN",
          failedLoginAttempts: 0,
          lockUntil: null,
        },
        create: {
          username: envAdminId!,
          passwordHash: passwordHash,
          role: "SUPERADMIN",
        },
      });

      const wallet = await prisma.wallet.findUnique({ where: { userId: superAdmin.id } });
      if (!wallet) {
        await prisma.wallet.create({
          data: { userId: superAdmin.id, balance: 0.0 },
        });
      }

      await createSession({
        userId: superAdmin.id,
        role: superAdmin.role,
        username: superAdmin.username,
      });

      return NextResponse.json({
        user: {
          id: superAdmin.id,
          username: superAdmin.username,
          role: superAdmin.role,
          telegramUsername: superAdmin.telegramUsername,
          telegramId: superAdmin.telegramId,
        },
      });
    }

    // 5. Fallback to normal DB login
    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    // The admin credentials live in the environment; the SUPERADMIN row is only
    // a mirror that the override above rewrites on each successful env login.
    // That mirror still holds the PREVIOUS id and password hash right after
    // .env is rotated, and reaching this line means the submitted credentials
    // did NOT match the current environment — so accepting the stored hash here
    // would authenticate exactly the credential pair the rotation was meant to
    // revoke. That is why the retired id kept working after ADMIN_ID changed.
    // Any username matching ADMIN_ID, and any leftover SUPERADMIN row under an
    // old name, must be verified against the environment and nothing else.
    const isEnvManagedAdmin =
      envAdminConfigured && (username === envAdminId || user.role === "SUPERADMIN");

    const passwordMatch = isEnvManagedAdmin
      ? false
      : await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      const newAttempts = user.failedLoginAttempts + 1;
      let lockDurationMs = 0;
      
      if (newAttempts >= 11) {
        lockDurationMs = 24 * 60 * 60 * 1000;
      } else if (newAttempts >= 8) {
        lockDurationMs = 15 * 60 * 1000;
      } else if (newAttempts >= 5) {
        lockDurationMs = 5 * 60 * 1000;
      }

      let remainingAttempts = 0;
      if (newAttempts < 5) remainingAttempts = 5 - newAttempts;
      else if (newAttempts < 8) remainingAttempts = 8 - newAttempts;
      else if (newAttempts < 11) remainingAttempts = 11 - newAttempts;

      let msg = "Invalid username or password.";
      if (lockDurationMs > 0) {
        msg = `Account locked due to too many failed attempts. Try again later.`;
      } else if (remainingAttempts > 0) {
        msg += ` You have ${remainingAttempts} attempt(s) remaining before a temporary lock.`;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockUntil: lockDurationMs > 0 ? new Date(Date.now() + lockDurationMs) : null,
        }
      });

      return NextResponse.json({ error: msg }, { status: 401 });
    }

    // Reset attempts on successful DB login
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockUntil: null }
      });
    }

    // 5. Create Session
    await createSession({
      userId: user.id,
      role: user.role,
      username: user.username,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        telegramUsername: user.telegramUsername,
        telegramId: user.telegramId,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
