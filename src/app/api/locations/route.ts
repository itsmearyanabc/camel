import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const cities = await prisma.city.findMany({
      include: { areas: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ cities });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
