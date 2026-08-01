import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptPassword, isEncryptionConfigured } from "@/lib/encryption";

/**
 * POST /api/admin/users/[id]/decrypt-password
 *
 * Admin-only endpoint that reveals a user's password.
 * The caller must supply the decryption key (the value of the
 * PASSWORD_ENCRYPTION_KEY environment variable). The key is verified
 * server-side before the password is decrypted and returned.
 *
 * Body: { key: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication required
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Strictly admin only - staff and regular users are forbidden
    if (session.role !== "ADMIN" && session.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    if (!isEncryptionConfigured()) {
      return NextResponse.json(
        { error: "Password encryption is not configured on the server" },
        { status: 500 }
      );
    }

    // Parse the supplied decryption key
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const suppliedKey = typeof body?.key === "string" ? body.key.trim() : "";
    if (!suppliedKey) {
      return NextResponse.json({ error: "Decryption key is required" }, { status: 400 });
    }

    // Verify the supplied key against the server's encryption key
    const serverKey = process.env.PASSWORD_ENCRYPTION_KEY || "";
    if (suppliedKey !== serverKey) {
      return NextResponse.json(
        { error: "Incorrect decryption key" },
        { status: 403 }
      );
    }

    const { id: userId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, passwordEncrypted: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.passwordEncrypted) {
      return NextResponse.json(
        { error: "No encrypted password stored for this user" },
        { status: 404 }
      );
    }

    try {
      const password = decryptPassword(user.passwordEncrypted);
      return NextResponse.json({
        userId: user.id,
        username: user.username,
        password,
      });
    } catch (error) {
      console.error("Failed to decrypt password:", error);
      return NextResponse.json(
        { error: "Failed to decrypt password" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Decrypt password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
