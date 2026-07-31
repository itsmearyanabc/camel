import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { encryptPassword, isEncryptionConfigured } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    // Fetch the user
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Encrypt new password for admin recovery (if encryption is configured)
    let passwordEncrypted: string | null = null;
    if (isEncryptionConfigured()) {
      try {
        passwordEncrypted = encryptPassword(newPassword);
      } catch (error) {
        console.error("Failed to encrypt password:", error);
        // Continue without encrypted password - not critical
      }
    }

    // Update password hash and encrypted password
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        passwordHash: newPasswordHash,
        passwordEncrypted,
      },
    });

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (error: any) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
