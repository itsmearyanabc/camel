import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession, deleteSession } from "@/lib/auth";
import { deleteUserPermanently } from "@/lib/userDeletion";

/**
 * POST /api/auth/delete-account
 *
 * Lets a signed-in user permanently erase their own account and every record
 * attached to it. Requires the account password in the body, so an unattended
 * session cannot be used to wipe someone's history.
 *
 * Body: { password: string }
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const password = typeof body?.password === "string" ? body.password : "";
    if (!password) {
      return NextResponse.json({ error: "Your password is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Staff and admin accounts are managed from the control panel - self-serve
    // deletion here would let one wrong click remove an operator account.
    if (["STAFF", "ADMIN", "SUPERADMIN"].includes(user.role)) {
      return NextResponse.json(
        { error: "Staff and admin accounts must be removed by an administrator." },
        { status: 403 }
      );
    }

    const summary = await deleteUserPermanently(user.id);

    console.warn(
      `[ACCOUNT DELETED] ${summary.username} deleted their own account - ` +
      `${summary.ordersDeleted} order(s), ${summary.reservationsReleased} reservation(s) released.`
    );

    // Drop the cookie so the browser is logged out immediately.
    await deleteSession();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Self delete account error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
