import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cities = await prisma.city.findMany({
    include: { areas: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ cities });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, name, cityId } = await req.json();

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
  }

  try {
    if (type === "CITY") {
      const existing = await prisma.city.findUnique({ where: { name: name.trim() } });
      if (existing) {
        return NextResponse.json({ error: "City already exists" }, { status: 400 });
      }
      const city = await prisma.city.create({ data: { name: name.trim() } });
      return NextResponse.json({ city });
    } else if (type === "AREA") {
      if (!cityId) return NextResponse.json({ error: "City ID is required for Area" }, { status: 400 });
      const area = await prisma.area.create({ data: { name: name.trim(), cityId } });
      return NextResponse.json({ area });
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to create location" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  try {
    if (type === "CITY") {
      await prisma.city.delete({ where: { id } });
    } else if (type === "AREA") {
      await prisma.area.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete location" }, { status: 500 });
  }
}
