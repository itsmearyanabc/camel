import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { staffId } = body;

    if (!staffId) {
      return NextResponse.json({ error: "Staff ID is required" }, { status: 400 });
    }

    // Unlock the staff account by resetting failed attempts and removing lock
    await prisma.user.update({
      where: { id: staffId },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
      },
    });

    return NextResponse.json({ success: true, message: "Staff account unlocked successfully" });
  } catch (e) {
    console.error("POST /api/admin/staff-unlock error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
