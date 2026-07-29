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
      const depositRequest = await prisma.depositRequest.findUnique({
        where: { id: order_id }
      });

      if (!depositRequest) {
        console.error("DepositRequest not found:", order_id);
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      if (depositRequest.status === "APPROVED") {
        // Already processed
        return NextResponse.json({ success: true, message: "Already processed" });
      }

      // Start a transaction to safely approve the deposit and update wallet
      await prisma.$transaction(async (tx) => {
        // 1. Mark as APPROVED
        await tx.depositRequest.update({
          where: { id: order_id },
          data: { status: "APPROVED", updatedAt: new Date() }
        });

        // 2. Add to wallet balance
        const wallet = await tx.wallet.findUnique({
          where: { userId: depositRequest.userId }
        });

        if (wallet) {
          const newBalance = Number(wallet.balance) + Number(depositRequest.amount);
          
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: newBalance, updatedAt: new Date() }
          });

          // 3. Add to wallet ledger
          await tx.walletLedger.create({
            data: {
              walletId: wallet.id,
              type: "DEPOSIT",
              amount: depositRequest.amount,
              description: `Cryptomus automated deposit`,
            }
          });
        }
      });

      console.log(`Successfully processed Cryptomus deposit for ${order_id} (Amount: $${depositRequest.amount})`);
    } else if (status === "fail" || status === "cancel" || status === "system_fail") {
       await prisma.depositRequest.update({
         where: { id: order_id },
         data: { status: "REJECTED", updatedAt: new Date() }
       });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error processing Cryptomus webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
