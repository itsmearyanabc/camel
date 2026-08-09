import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden. Admin privileges required." }, { status: 403 });
    }

    // Re-check role from DB so demoted cookies cannot keep privileges
    const actor = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!actor || !["ADMIN", "SUPERADMIN"].includes(actor.role)) {
      return NextResponse.json({ error: "Forbidden. Admin privileges required." }, { status: 403 });
    }

    const { userId, role } = await req.json();

    if (!userId || !role) {
      return NextResponse.json({ error: "User ID and role are required" }, { status: 400 });
    }

    if (!["CUSTOMER", "STAFF", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Invalid role specification" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.role === "SUPERADMIN") {
      return NextResponse.json({ error: "Cannot change a SUPERADMIN role." }, { status: 403 });
    }

    // Admin accounts cannot be deleted, so they must not be demotable by a
    // peer either - otherwise "demote to customer, then delete" walks straight
    // around that rule. Only ROOT can move an admin out of the role.
    if (target.role === "ADMIN" && actor.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Only SUPERADMIN can change an admin's role." },
        { status: 403 }
      );
    }

    if (role === "ADMIN" && actor.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Only SUPERADMIN can assign ADMIN role." }, { status: 403 });
    }

    if (target.id === actor.id && role !== actor.role) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 403 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return NextResponse.json({ success: true, role: updatedUser.role });
  } catch (error) {
    console.error("Admin role adjust error:", error);
    return NextResponse.json({ error: "Internal server error updating user role" }, { status: 500 });
  }
}
