import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { decryptAnswer } from "../captcha/route";
import { encryptPassword, isEncryptionConfigured } from "@/lib/encryption";
import { resolveReferralCode, normaliseReferralCode } from "@/lib/bonuses";

export async function POST(req: Request) {
  try {
    const { username, password, confirmPassword, telegramUsername, telegramId, referralCode, captchaAnswer, captchaToken } = await req.json();

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
    }

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

    if (username.length < 3) {
      return NextResponse.json({ error: "Username must be at least 3 characters long" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long" }, { status: 400 });
    }

    // 3. Check for existing username
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 400 });
    }

    if (telegramId) {
      const existingTelegram = await prisma.user.findUnique({
        where: { telegramId: String(telegramId) },
      });
      if (existingTelegram) {
        return NextResponse.json(
          { error: "This Telegram ID is already linked to another account." },
          { status: 400 }
        );
      }
    }

    // 3b. Resolve the optional referral code.
    //
    // Deliberately not a validation gate: an unknown or mistyped code loses the
    // referrer their bonus but must never stop somebody opening an account.
    // `referralAccepted` is echoed back so the browser can say which of the two
    // happened instead of leaving the customer to guess.
    const referralAttempted = normaliseReferralCode(referralCode).length > 0;
    const referredById = referralAttempted ? await resolveReferralCode(referralCode) : null;

    // 4. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4b. Encrypt password for admin recovery (if encryption is configured)
    let passwordEncrypted: string | null = null;
    if (isEncryptionConfigured()) {
      try {
        passwordEncrypted = encryptPassword(password);
      } catch (error) {
        console.error("Failed to encrypt password:", error);
        // Continue without encrypted password - not critical
      }
    }

    // 5. Create user and wallet in transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          // @ts-ignore - suppress IDE cache error for new schema field
          passwordEncrypted,
          telegramUsername: telegramUsername || null,
          telegramId: telegramId || null,
          role: "CUSTOMER", // default role
          referredById,
        },
      });

      await tx.wallet.create({
        data: {
          userId: user.id,
          balance: 0.0,
        },
      });

      return user;
    });

    // 6. Create session cookie
    await createSession({
      userId: newUser.id,
      role: newUser.role,
      username: newUser.username,
    });

    // No signup bonus is paid here on purpose. The $5 is for a PROVEN Telegram
    // link, and this route accepts whatever telegramId the browser sends - it
    // verifies nothing. Paying here would let anyone mint $5 per account with a
    // made-up id. The bot pays it instead, where Telegram itself supplies the
    // id; see grantTelegramSignupBonus in src/lib/bonuses.ts.
    return NextResponse.json({
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        telegramUsername: newUser.telegramUsername,
        telegramId: newUser.telegramId,
      },
      referralAccepted: Boolean(referredById),
      referralRejected: referralAttempted && !referredById,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
