import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    let order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: true }
        }
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify ownership
    if (order.userId !== session.userId && !["STAFF", "ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized access to order" }, { status: 403 });
    }

    let itemsUpdated = false;

    // Check if cooldown has finished for each item
    for (const item of order.items) {
      if (item.status === "COOLDOWN_ACTIVE" && item.cooldownEndAt) {
        const now = new Date();
        if (now >= item.cooldownEndAt) {
          
          let locationLink = null;
          let pickupVideoUrl = null;
          let adminMessage = "Your product is ready for pickup!";

          if (item.areaId) {
            const areaDetail = await prisma.productAreaDetail.findUnique({
              where: {
                productId_areaId: { productId: item.productId, areaId: item.areaId }
              }
            });
            
            if (areaDetail) {
              locationLink = areaDetail.locationUrl || null;
              pickupVideoUrl = areaDetail.videoUrl || null;
              if (areaDetail.message) adminMessage = areaDetail.message;
            }
          }

          await prisma.orderItem.update({
            where: { id: item.id },
            data: { 
              status: "ON_PICKUP",
              locationLink,
              pickupVideoUrl,
              adminMessage,
              adminMessageSentAt: new Date(),
              onPickupAt: new Date(),
            },
          });
          itemsUpdated = true;
        }
      }
    }

    if (itemsUpdated) {
      // Update master order to PROCESSING
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "PROCESSING" },
      });

      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: { product: true }
          }
        },
      });
      // If all items are COMPLETED, update master order status
      if (order && order.items.every(i => i.status === "COMPLETED")) {
        order = await prisma.order.update({
          where: { id: orderId },
          data: { status: "COMPLETED" },
          include: {
            items: {
              include: { product: true }
            }
          },
        });
      }
    }

    return NextResponse.json({
      order: {
        ...order,
      },
    });
  } catch (error) {
    console.error("Order status update error:", error);
    return NextResponse.json({ error: "Internal server error checking order status" }, { status: 500 });
  }
}
