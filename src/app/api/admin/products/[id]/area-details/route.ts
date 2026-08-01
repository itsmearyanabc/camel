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
    // Upsert each area detail and sync its per-unit stock items.
    for (const detail of areaDetails) {
      const stockItems: Array<{ locationUrl?: string; videoUrl?: string }> = Array.isArray(detail.stockItems)
        ? detail.stockItems
        : [];

      const saved = await prisma.productAreaDetail.upsert({
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
      });

      // Sync per-unit stock items if provided.
      if (Array.isArray(detail.stockItems)) {
        // Remove existing AVAILABLE units (used ones are kept for history).
        await prisma.stockItem.deleteMany({
          where: { productAreaDetailId: saved.id, status: "AVAILABLE" }
        });

        // Create the new set of available units.
        if (stockItems.length > 0) {
          await prisma.stockItem.createMany({
            data: stockItems.map((item) => ({
              productAreaDetailId: saved.id,
              locationUrl: item.locationUrl || null,
              videoUrl: item.videoUrl || null,
              status: "AVAILABLE",
            }))
          });
        }

        // Keep stockQuantity in sync with the number of available units.
        await prisma.productAreaDetail.update({
          where: { id: saved.id },
          data: { stockQuantity: stockItems.length }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update area details error:", error);
    return NextResponse.json({ error: "Failed to update area details" }, { status: 500 });
  }
}
