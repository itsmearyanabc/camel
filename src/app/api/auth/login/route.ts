import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { decryptAnswer } from "../captcha/route";
import { rateLimit, getRateLimitIdentifier } from "@/lib/rate-limit";

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

    const { username, password, captchaAnswer, captchaToken } = await req.json();

    // 1. CAPTCHA Validation
    if (!captchaToken || !captchaAnswer) {
      return NextResponse.json({ error: "CAPTCHA is required" }, { status: 400 });
    }

    const decrypted = decryptAnswer(captchaToken);
    if (!decrypted) {
      return NextResponse.json({ error: "Invalid CAPTCHA token" }, { status: 400 });
    }

    try {
      const captchaData = JSON.parse(decrypted);
      if (captchaData.expiresAt < Date.now()) {
        return NextResponse.json({ error: "CAPTCHA expired, please try again" }, { status: 400 });
      }
      if (captchaData.answer !== captchaAnswer.trim()) {
        return NextResponse.json({ error: "Incorrect CAPTCHA answer" }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: "Invalid CAPTCHA payload" }, { status: 400 });
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
    const envAdminId = process.env.ADMIN_ID;
    const envAdminPassword = process.env.ADMIN_PASSWORD;

    if (envAdminId && envAdminPassword && username === envAdminId && password === envAdminPassword) {
      // Reset attempts if needed
      if (user && (user.failedLoginAttempts > 0 || user.lockUntil)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockUntil: null }
        });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(envAdminPassword, salt);
      
      const superAdmin = await prisma.user.upsert({
        where: { username: envAdminId },
        update: {
          passwordHash: passwordHash,
          role: "SUPERADMIN",
        },
        create: {
          username: envAdminId,
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

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    
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
