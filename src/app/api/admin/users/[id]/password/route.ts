import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptPassword, isEncryptionConfigured } from "@/lib/encryption";

/**
 * GET /api/admin/users/[id]/password
 * 
 * Retrieve decrypted password for a user (admin only)
 * Used when customers forget their password and contact support
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (session.role !== "ADMIN" && session.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    // Check if encryption is configured
    if (!isEncryptionConfigured()) {
      return NextResponse.json(
        { 
          error: "Password encryption is not configured",
          message: "Please set PASSWORD_ENCRYPTION_KEY in environment variables"
        },
        { status: 500 }
      );
    }

    // Await params in Next.js 15+
    const { id: userId } = await params;

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        passwordEncrypted: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.passwordEncrypted) {
      return NextResponse.json(
        { 
          error: "No encrypted password found",
          message: "This user was created before password encryption was enabled"
        },
        { status: 404 }
      );
    }

    // Decrypt password
    try {
      const decryptedPassword = decryptPassword(user.passwordEncrypted);

      return NextResponse.json({
        userId: user.id,
        username: user.username,
        password: decryptedPassword,
      });
    } catch (error) {
      console.error("Failed to decrypt password:", error);
      return NextResponse.json(
        { 
          error: "Failed to decrypt password",
          message: "The encrypted password may be corrupted or the encryption key may have changed"
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Get password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
