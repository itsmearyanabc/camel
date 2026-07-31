import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptPassword } from "@/lib/encryption";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden. Admin privileges required." }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      include: {
        wallet: true,
      },
      orderBy: { username: "asc" },
      take: 100,
    });

    const safeUsers = users.map((u) => {
      // Decrypt password for admin viewing
      let decryptedPassword = null;
      if (u.passwordEncrypted) {
        try {
          decryptedPassword = decryptPassword(u.passwordEncrypted);
        } catch (e) {
          console.error(`Failed to decrypt password for user ${u.username}:`, e);
          decryptedPassword = "[Decryption failed]";
        }
      }

      return {
        id: u.id,
        username: u.username,
        role: u.role,
        telegramUsername: u.telegramUsername,
        password: decryptedPassword, // Include decrypted password for admin
        wallet: u.wallet ? {
          id: u.wallet.id,
          balance: u.wallet.balance,
        } : null,
      };
    });

    return NextResponse.json({ users: safeUsers });
  } catch (error) {
    console.error("Admin fetch users error:", error);
    return NextResponse.json({ error: "Internal server error fetching users" }, { status: 500 });
  }
}
