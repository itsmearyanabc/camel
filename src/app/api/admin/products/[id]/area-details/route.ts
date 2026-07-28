import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: productId } = await params;
  const { areaDetails } = await req.json();

  if (!areaDetails || !Array.isArray(areaDetails)) {
    return NextResponse.json({ error: "Invalid area details" }, { status: 400 });
  }

  try {
    // We will upsert each area detail.
    // It's a transactional operation to update them all.
    await prisma.$transaction(
      areaDetails.map((detail: any) => 
        prisma.productAreaDetail.upsert({
          where: {
            productId_areaId: {
              productId,
              areaId: detail.areaId,
            }
          },
          update: {
            locationUrl: detail.locationUrl || null,
            videoUrl: detail.videoUrl || null,
            message: detail.message || null,
            cooldownMinutes: parseInt(detail.cooldownMinutes) || 0,
          },
          create: {
            productId,
            areaId: detail.areaId,
            locationUrl: detail.locationUrl || null,
            videoUrl: detail.videoUrl || null,
            message: detail.message || null,
            cooldownMinutes: parseInt(detail.cooldownMinutes) || 0,
          }
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update area details error:", error);
    return NextResponse.json({ error: "Failed to update area details" }, { status: 500 });
  }
}
