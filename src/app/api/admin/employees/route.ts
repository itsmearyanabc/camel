import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const staff = await prisma.user.findMany({
      where: { role: "STAFF" },
      select: {
        id: true,
        username: true,
        createdAt: true,
        failedLoginAttempts: true,
        lockUntil: true,
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ staff });
  } catch (e) {
    console.error("GET /api/admin/employees error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newStaff = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: "STAFF"
      }
    });

    return NextResponse.json({ staff: { id: newStaff.id, username: newStaff.username, createdAt: newStaff.createdAt } });
  } catch (e) {
    console.error("POST /api/admin/employees error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { staffId, newPassword } = body;

    if (!staffId || !newPassword) {
      return NextResponse.json({ error: "Staff ID and new password are required" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: staffId },
      data: {
        passwordHash
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("PUT /api/admin/employees error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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

    await prisma.user.delete({
      where: { id: staffId }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/admin/employees error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
