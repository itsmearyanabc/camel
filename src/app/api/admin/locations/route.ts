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
  // Cities and areas are catalogue structure, not inventory: staff may read
  // them (to stock a product in an area) but only admins may create them.
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized. Only admins can add locations." }, { status: 403 });
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

/**
 * Rename a city or an area.
 *
 * Renaming is display-only and therefore safe on live data: every reference to
 * a location - ProductAreaDetail, OrderItem.areaId, RestockSubscription - is by
 * id, so nothing about stock, delivery or order history moves. Past orders will
 * show the corrected name, which is the point of fixing a typo.
 *
 * Deliberately does NOT move an area to a different city. That is not a
 * correction, it relocates every unit of stock and every pickup point beneath
 * it, and it needs its own deliberate flow rather than being smuggled in behind
 * an edit button.
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  // Same bar as creating and deleting: catalogue structure is admin-only.
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized. Only admins can edit locations." }, { status: 403 });
  }

  const { type, id, name } = await req.json();

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
  }

  try {
    if (type === "CITY") {
      const city = await prisma.city.findUnique({ where: { id } });
      if (!city) {
        return NextResponse.json({ error: "City not found" }, { status: 404 });
      }
      // A no-op rename is a success, not a duplicate-name error - otherwise
      // saving a row without changing it reports a failure.
      if (city.name !== trimmed) {
        const clash = await prisma.city.findUnique({ where: { name: trimmed } });
        if (clash) {
          return NextResponse.json({ error: "Another city already has that name" }, { status: 400 });
        }
      }
      const updated = await prisma.city.update({ where: { id }, data: { name: trimmed } });
      return NextResponse.json({ city: updated });
    }

    if (type === "AREA") {
      const area = await prisma.area.findUnique({ where: { id } });
      if (!area) {
        return NextResponse.json({ error: "Area not found" }, { status: 404 });
      }
      // Area names are not globally unique - two cities may each have a
      // "Downtown" - so the clash check is scoped to the area's own city, which
      // is the only place a duplicate would actually be ambiguous to staff
      // picking a delivery area.
      if (area.name !== trimmed) {
        const clash = await prisma.area.findFirst({
          where: { cityId: area.cityId, name: trimmed, id: { not: id } },
        });
        if (clash) {
          return NextResponse.json(
            { error: "Another area in this city already has that name" },
            { status: 400 }
          );
        }
      }
      const updated = await prisma.area.update({ where: { id }, data: { name: trimmed } });
      return NextResponse.json({ area: updated });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Rename location error:", error);
    return NextResponse.json({ error: "Failed to rename location" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  // Admin-only. Deleting a city cascades through its areas into every
  // ProductAreaDetail and StockItem beneath them, wiping stock counts and the
  // per-unit location/video links for every product sold there.
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized. Only admins can delete locations." }, { status: 403 });
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
