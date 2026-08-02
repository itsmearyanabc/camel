import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNOWPaymentInvoice, isNOWPaymentsConfigured, getPublicBaseUrl } from "@/lib/nowpayments";

// Customers get an hour to complete a deposit before the request is closed out.
const PAYMENT_WINDOW_MINUTES = 60;

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

    // Guard against absurd values reaching the gateway, and round to cents so
    // the credited amount always matches what was invoiced.
    if (depositAmount > 100000) {
      return NextResponse.json({ error: "Deposit amount is too large" }, { status: 400 });
    }
    const roundedAmount = Math.round(depositAmount * 100) / 100;

    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.userId },
    });

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const gatewayEnabled = isNOWPaymentsConfigured();

    const depositRequest = await prisma.depositRequest.create({
      data: {
        userId: session.userId,
        amount: roundedAmount,
        status: "PENDING",
        paymentProvider: gatewayEnabled ? "NOWPAYMENTS" : null,
        paymentStatus: gatewayEnabled ? "waiting" : null,
        paymentExpiresAt: gatewayEnabled
          ? new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000)
          : null,
      },
    });

    // Check if NOWPayments is configured
    if (!gatewayEnabled) {
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
    const baseUrl = getPublicBaseUrl();
    if (!baseUrl) {
      await prisma.depositRequest.update({
        where: { id: depositRequest.id },
        data: { status: "REJECTED", paymentStatus: "misconfigured" },
      });
      console.error("NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL is not set - refusing to create invoice");
      return NextResponse.json({
        error: "Payment gateway is not configured. Please contact support.",
      }, { status: 503 });
    }

    const invoiceResult = await createNOWPaymentInvoice({
      priceAmount: roundedAmount,
      priceCurrency: "usd",
      // No pay_currency: the hosted page lets the customer pick any coin.
      orderId: depositRequest.id,
      orderDescription: `Wallet Deposit - $${roundedAmount.toFixed(2)}`,
      ipnCallbackUrl: `${baseUrl}/api/webhooks/nowpayments`,
      successUrl: `${baseUrl}/dashboard?deposit=success`,
      cancelUrl: `${baseUrl}/dashboard?deposit=cancelled`,
    });

    if (!invoiceResult.success || !invoiceResult.invoice) {
      await prisma.depositRequest.update({
        where: { id: depositRequest.id },
        data: { status: "REJECTED", paymentStatus: "gateway_error" },
      });
      console.error("NOWPayments error:", invoiceResult.error);
      return NextResponse.json({
        error: "Failed to generate payment gateway",
        details: invoiceResult.error
      }, { status: 502 });
    }

    await prisma.depositRequest.update({
      where: { id: depositRequest.id },
      data: {
        providerInvoiceId: String(invoiceResult.invoice.id),
        paymentUrl: invoiceResult.invoice.invoice_url,
      },
    });

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
