import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { decryptAnswer } from "../captcha/route";
import { encryptPassword, isEncryptionConfigured } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const { username, password, confirmPassword, telegramUsername, telegramId, captchaAnswer, captchaToken } = await req.json();

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

    return NextResponse.json({
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        telegramUsername: newUser.telegramUsername,
        telegramId: newUser.telegramId,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
