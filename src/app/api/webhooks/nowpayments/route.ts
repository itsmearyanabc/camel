import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyNOWPaymentsIPN } from "@/lib/nowpayments";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body;
    
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Get signature from headers
    const signature = req.headers.get("x-nowpayments-sig");
    
    if (!signature) {
      console.error("NOWPayments webhook: Missing signature");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    // Verify IPN signature
    const isValid = verifyNOWPaymentsIPN(body, signature);
    
    if (!isValid) {
      console.error("NOWPayments webhook: Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const { payment_status, order_id, payment_id } = body;

    console.log(`NOWPayments webhook received: ${payment_status} for order ${order_id}`);

    // NOWPayments payment statuses:
    // waiting, confirming, confirmed, sending, partially_paid, finished, failed, refunded, expired

    if (payment_status === "finished" || payment_status === "confirmed") {
      // Payment successful
      
      // 1. Check if it's a Deposit Request
      const depositRequest = await prisma.depositRequest.findUnique({
        where: { id: order_id }
      });

      if (depositRequest) {
        const result = await prisma.$transaction(async (tx) => {
          const currentReq = await tx.depositRequest.findUnique({ where: { id: order_id } });
          if (currentReq?.status === "APPROVED") return "ALREADY_PROCESSED";

          await tx.depositRequest.update({
            where: { id: order_id },
            data: { status: "APPROVED", updatedAt: new Date() }
          });

          const wallet = await tx.wallet.findUnique({ where: { userId: currentReq!.userId } });
          if (wallet) {
            const newBalance = Number(wallet.balance) + Number(currentReq!.amount);
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: newBalance, updatedAt: new Date() }
            });

            await tx.walletLedger.create({
              data: {
                walletId: wallet.id,
                type: "DEPOSIT",
                amount: currentReq!.amount,
                description: `NOWPayments automated deposit (Payment ID: ${payment_id})`,
              }
            });
          }
          return "PROCESSED";
        });

        if (result === "ALREADY_PROCESSED") {
          return NextResponse.json({ success: true, message: "Already processed" });
        }
        
        console.log(`Successfully processed NOWPayments deposit for ${order_id}`);
        return NextResponse.json({ success: true });
      }

      // 2. Check if it's a Direct Order Checkout
      const order = await prisma.order.findUnique({
        where: { id: order_id }
      });

      if (order) {
        const result = await prisma.$transaction(async (tx) => {
          const currentOrder = await tx.order.findUnique({ 
            where: { id: order_id }, 
            include: { items: true } 
          });
          
          if (currentOrder?.status !== "PENDING_PAYMENT") {
            return "ALREADY_PROCESSED";
          }

          // Mark order as COOLDOWN_ACTIVE so the delivery cron picks it up
          await tx.order.update({
            where: { id: order_id },
            data: { status: "COOLDOWN_ACTIVE", updatedAt: new Date() }
          });

          // Update items: start cooldown from payment confirmation time
          for (const item of currentOrder!.items) {
            let cooldownMinutes = 0;
            if (item.areaId) {
              const areaDetail = await tx.productAreaDetail.findUnique({
                where: { productId_areaId: { productId: item.productId, areaId: item.areaId } }
              });
              if (areaDetail && areaDetail.cooldownMinutes > 0) {
                cooldownMinutes = areaDetail.cooldownMinutes;
              }
            }
            const cd = new Date();
            cd.setMinutes(cd.getMinutes() + cooldownMinutes);

            await tx.orderItem.update({
              where: { id: item.id },
              data: { status: "COOLDOWN_ACTIVE", cooldownEndAt: cd }
            });
          }
          
          return "PROCESSED";
        });

        if (result === "ALREADY_PROCESSED") {
          return NextResponse.json({ success: true, message: "Already processed" });
        }
        
        console.log(`Successfully processed NOWPayments order for ${order_id}`);
        return NextResponse.json({ success: true });
      }

      console.error("Order or Deposit not found:", order_id);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });

    } else if (payment_status === "failed" || payment_status === "expired" || payment_status === "refunded") {
      // Payment failed or expired
      
      // Mark deposit as rejected
      const depositReq = await prisma.depositRequest.findUnique({ where: { id: order_id } });
      if (depositReq) {
        await prisma.depositRequest.update({ 
          where: { id: order_id }, 
          data: { status: "REJECTED", updatedAt: new Date() } 
        });
      }
      
      // Restore stock for cancelled orders
      const orderReq = await prisma.order.findUnique({ 
        where: { id: order_id },
        include: { items: true }
      });
      
      if (orderReq && orderReq.status === "PENDING_PAYMENT") {
        await prisma.$transaction(async (tx) => {
          // Restore stock for each item (each order item = 1 unit)
          for (const item of orderReq.items) {
            // Restore global stock
            await tx.product.update({
              where: { id: item.productId },
              data: { stockQuantity: { increment: 1 } }
            });

            // Restore area-level stock
            if (item.areaId) {
              const areaDetail = await tx.productAreaDetail.findUnique({
                where: { productId_areaId: { productId: item.productId, areaId: item.areaId } }
              });
              if (areaDetail) {
                await tx.productAreaDetail.update({
                  where: { id: areaDetail.id },
                  data: { stockQuantity: { increment: 1 } }
                });
              }
            }

            // Release the reserved per-unit stock item back to AVAILABLE
            if (item.stockItemId) {
              await tx.stockItem.update({
                where: { id: item.stockItemId },
                data: { status: "AVAILABLE" }
              });
            }
          }
          
          // Mark order as cancelled
          await tx.order.update({ 
            where: { id: order_id }, 
            data: { status: "CANCELLED", updatedAt: new Date() } 
          });
        });
      }
      
      console.log(`NOWPayments payment ${payment_status} for order ${order_id}`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error processing NOWPayments webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
