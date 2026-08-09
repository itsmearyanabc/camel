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
    // Note: the stock ledger entry and the restock alert for a quantity change
    // are raised by PUT /api/admin/products, which runs first and is the only
    // step that still sees the previous quantity. This route just makes the
    // per-unit rows match.
    // Upsert each area detail and sync its per-unit stock items.
    for (const detail of areaDetails) {
      const stockItems: Array<{ id?: string; locationUrl?: string; videoUrl?: string }> = Array.isArray(detail.stockItems)
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
        // Drop any submitted unit that has been sold since the form was loaded.
        //
        // The editor holds a snapshot of the units that were AVAILABLE when it
        // opened. If a customer buys one before the admin saves, that unit is
        // now USED - but it is still in the submitted list. Recreating it would
        // put an already-delivered location and video back on the shelf and
        // hand them to a second customer. Units carry their id, so anything
        // that is no longer AVAILABLE is discarded here; entries without an id
        // are genuinely new.
        const submittedIds = stockItems
          .map((item: any) => item?.id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

        let stillAvailable = new Set<string>();
        if (submittedIds.length > 0) {
          const rows = await prisma.stockItem.findMany({
            where: { id: { in: submittedIds }, productAreaDetailId: saved.id, status: "AVAILABLE" },
            select: { id: true },
          });
          stillAvailable = new Set(rows.map((r) => r.id));
        }

        const surviving = stockItems.filter(
          (item: any) => !item?.id || stillAvailable.has(item.id)
        );

        // Remove existing AVAILABLE units (used ones are kept for history).
        await prisma.stockItem.deleteMany({
          where: { productAreaDetailId: saved.id, status: "AVAILABLE" }
        });

        // Create the new set of available units.
        if (surviving.length > 0) {
          await prisma.stockItem.createMany({
            data: surviving.map((item) => ({
              productAreaDetailId: saved.id,
              locationUrl: item.locationUrl || null,
              videoUrl: item.videoUrl || null,
              status: "AVAILABLE",
            }))
          });
        }

        // Keep stockQuantity in sync with the number of available units. This
        // also repairs the count if the step above dropped a sold unit.
        await prisma.productAreaDetail.update({
          where: { id: saved.id },
          data: { stockQuantity: surviving.length }
        });
      }
    }

    // Global stock mirrors the sum of every area, so recompute it here too -
    // the per-unit sync above can land on a different number than the caller
    // sent as the area quantity.
    const allAreaDetails = await prisma.productAreaDetail.findMany({
      where: { productId },
      select: { stockQuantity: true },
    });
    await prisma.product.update({
      where: { id: productId },
      data: {
        stockQuantity: allAreaDetails.reduce((sum, d) => sum + (d.stockQuantity || 0), 0),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update area details error:", error);
    return NextResponse.json({ error: "Failed to update area details" }, { status: 500 });
  }
}
