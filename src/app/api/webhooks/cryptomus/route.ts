import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const paymentKey = process.env.CRYPTOMUS_API_KEY;
    if (!paymentKey) {
      console.error("Webhook received but CRYPTOMUS_API_KEY is not set.");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    // Verify signature
    const { sign, ...payloadWithoutSign } = body;
    const payloadString = JSON.stringify(payloadWithoutSign);
    
    // Cryptomus explicitly requires parsing exactly the same JSON it sends, or re-encoding it without escape sequences. 
    // In Node.js, `JSON.parse` then `JSON.stringify` works well if you avoid escaping slashes.
    // However, the most robust way is: base64(JSON payload) + API_KEY
    // The official docs say: MD5(base64_encode(json_encode(payload, JSON_UNESCAPED_UNICODE)) + API_KEY)
    const base64Payload = Buffer.from(payloadString, 'utf8').toString('base64');
    const expectedSign = crypto.createHash('md5').update(base64Payload + paymentKey).digest('hex');

    if (sign !== expectedSign) {
      console.error("Cryptomus webhook signature mismatch", { sign, expectedSign });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Process payment
    const { order_id, status, amount } = body;

    // Cryptomus statuses indicating successful payment
    if (status === "paid" || status === "paid_over") {
      
      // 1. Check if it's a Deposit Request
      const depositRequest = await prisma.depositRequest.findUnique({
        where: { id: order_id }
      });

      if (depositRequest) {
        // Start a transaction to safely approve the deposit and update wallet atomically (prevents double spend race condition)
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
                description: `Cryptomus automated deposit`,
              }
            });
          }
          return "PROCESSED";
        });

        if (result === "ALREADY_PROCESSED") return NextResponse.json({ success: true, message: "Already processed" });
        console.log(`Successfully processed Cryptomus deposit for ${order_id}`);
        return NextResponse.json({ success: true });
      }

      // 2. Check if it's a Direct Order Checkout
      const order = await prisma.order.findUnique({
        where: { id: order_id }
      });

      if (order) {
        const result = await prisma.$transaction(async (tx) => {
          const currentOrder = await tx.order.findUnique({ where: { id: order_id }, include: { items: true } });
          if (currentOrder?.status !== "PENDING_PAYMENT") return "ALREADY_PROCESSED";

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

        if (result === "ALREADY_PROCESSED") return NextResponse.json({ success: true, message: "Already processed" });
        console.log(`Successfully processed Cryptomus direct order for ${order_id}`);
        return NextResponse.json({ success: true });
      }

      console.error("Order or Deposit not found:", order_id);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });

    } else if (status === "fail" || status === "cancel" || status === "system_fail") {
       // Mark as rejected if possible
       const depositReq = await prisma.depositRequest.findUnique({ where: { id: order_id } });
       if (depositReq) {
         await prisma.depositRequest.update({ where: { id: order_id }, data: { status: "REJECTED", updatedAt: new Date() } });
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
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error processing Cryptomus webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
