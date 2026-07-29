import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requests = await prisma.depositRequest.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    });

    const walletSetting = await prisma.setting.findUnique({
      where: { key: "CRYPTO_WALLET_ADDRESS" },
    });

    const cryptoAddress = walletSetting?.value || "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";

    return NextResponse.json({ requests, cryptoAddress });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { amount } = await req.json();
    const depositAmount = parseFloat(amount);

    if (isNaN(depositAmount) || depositAmount <= 0) {
      return NextResponse.json({ error: "Invalid deposit amount" }, { status: 400 });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.userId },
    });

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const depositRequest = await prisma.depositRequest.create({
      data: {
        userId: session.userId,
        amount: depositAmount,
        status: "PENDING",
      },
    });

    // Check if Cryptomus is configured
    const merchantId = process.env.CRYPTOMUS_MERCHANT_ID;
    const paymentKey = process.env.CRYPTOMUS_API_KEY;

    if (!merchantId || !paymentKey) {
      console.warn("Cryptomus not configured, falling back to manual deposit");
      return NextResponse.json({ 
        success: true, 
        depositRequest: {
          id: depositRequest.id,
          amount: depositRequest.amount,
          status: depositRequest.status,
          createdAt: depositRequest.createdAt,
        }
      });
    }

    // Generate Cryptomus Invoice
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://camel971.com";
    
    const payload = {
      amount: depositAmount.toString(),
      currency: "USD",
      order_id: depositRequest.id,
      url_return: `${baseUrl}/dashboard`,
      url_callback: `${baseUrl}/api/webhooks/cryptomus`,
      is_payment_multiple: false,
      lifetime: 3600
    };

    const payloadString = JSON.stringify(payload);
    const base64Payload = Buffer.from(payloadString).toString('base64');
    
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const sign = crypto.createHash('md5').update(base64Payload + paymentKey).digest('hex');

    const response = await fetch("https://api.cryptomus.com/v1/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "merchant": merchantId,
        "sign": sign
      },
      body: payloadString
    });

    const data = await response.json();

    if (data.state !== 0) {
      console.error("Cryptomus error:", data);
      return NextResponse.json({ error: "Failed to generate payment gateway" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      paymentUrl: data.result.url,
      depositRequest: {
        id: depositRequest.id,
        amount: depositRequest.amount,
        status: depositRequest.status,
        createdAt: depositRequest.createdAt,
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
