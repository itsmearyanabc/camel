import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { deleteUserPermanently } from "@/lib/userDeletion";

/**
 * DELETE /api/admin/users/[id]
 *
 * Permanently erases a user and all of their data. Irreversible, so the acting
 * admin has to re-enter their own account password in the request body - a
 * stolen session alone is not enough to wipe customer records.
 *
 * Body: { password: string }
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    // Re-read the role from the database so a demoted admin's still-valid
    // cookie cannot be used to delete accounts.
    const actor = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!actor || !["ADMIN", "SUPERADMIN"].includes(actor.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const password = typeof body?.password === "string" ? body.password : "";
    if (!password) {
      return NextResponse.json({ error: "Your password is required to confirm deletion" }, { status: 400 });
    }

    const passwordMatch = await bcrypt.compare(password, actor.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const { id: targetId } = await params;

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Admin accounts are never deletable - not by another admin, not by ROOT,
    // not by themselves. Losing them locks everyone out of the control panel.
    // Staff accounts are removed from the Employees tab instead, so the only
    // thing this endpoint erases is a customer profile.
    if (["ADMIN", "SUPERADMIN"].includes(target.role)) {
      return NextResponse.json(
        { error: "Admin accounts cannot be deleted." },
        { status: 403 }
      );
    }

    if (target.id === actor.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account." },
        { status: 400 }
      );
    }

    const summary = await deleteUserPermanently(targetId);

    console.warn(
      `[ACCOUNT DELETED] ${actor.username} (${actor.role}) permanently deleted ` +
      `${summary.username} - ${summary.ordersDeleted} order(s), ` +
      `${summary.reservationsReleased} reservation(s) released.`
    );

    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
