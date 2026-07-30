import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNOWPaymentInvoice, isNOWPaymentsConfigured } from "@/lib/nowpayments";

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

    // Check if NOWPayments is configured
    if (!isNOWPaymentsConfigured()) {
      console.warn("NOWPayments not configured, falling back to manual deposit");
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

    // Generate NOWPayments Invoice
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://camel971.com";
    
    const invoiceResult = await createNOWPaymentInvoice({
      priceAmount: depositAmount,
      priceCurrency: "usd",
      payCurrency: "usdttrc20", // Default to USDT TRC20, user can change on payment page
      orderId: depositRequest.id,
      orderDescription: `Wallet Deposit - $${depositAmount}`,
      ipnCallbackUrl: `${baseUrl}/api/webhooks/nowpayments`,
      successUrl: `${baseUrl}/dashboard?deposit=success`,
      cancelUrl: `${baseUrl}/dashboard?deposit=cancelled`,
    });

    if (!invoiceResult.success || !invoiceResult.invoice) {
      console.error("NOWPayments error:", invoiceResult.error);
      return NextResponse.json({ 
        error: "Failed to generate payment gateway",
        details: invoiceResult.error 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      paymentUrl: invoiceResult.invoice.invoice_url,
      invoiceId: invoiceResult.invoice.id,
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
