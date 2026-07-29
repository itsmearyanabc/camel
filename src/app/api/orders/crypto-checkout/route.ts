import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCryptoInfo, CRYPTO_CURRENCIES } from "@/lib/currencies";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { cart, cryptoCurrency, areaId } = await req.json();
    if (!cart || !Array.isArray(cart) || cart.length === 0 || !cryptoCurrency) {
      return NextResponse.json({ error: "Cart and crypto currency are required" }, { status: 400 });
    }

    // Validate crypto currency
    const cryptoInfo = getCryptoInfo(cryptoCurrency);
    if (!cryptoInfo) {
      return NextResponse.json({ 
        error: "Unsupported cryptocurrency",
        supported: CRYPTO_CURRENCIES.map(c => c.code),
      }, { status: 400 });
    }

    let totalAmountDue = 0;
    const orderItemsData = [];
    let firstProductName = "Multiple Items";

    // Validate inventory and calculate total price
    for (let i = 0; i < cart.length; i++) {
      const { productId, quantity } = cart[i];
      
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 });
      }

      if (i === 0) firstProductName = product.name;

      // Check stock availability
      if (product.stockQuantity < quantity) {
        return NextResponse.json({ error: `Not enough stock for ${product.name}. Requested: ${quantity}, Available: ${product.stockQuantity}` }, { status: 400 });
      }

      const itemCost = Number(product.price);
      totalAmountDue += itemCost * quantity;

      const areaDetail = await prisma.productAreaDetail.findUnique({
        where: { productId_areaId: { productId: product.id, areaId } }
      });
      
      let cooldownEndAt: Date = new Date();
      if (areaDetail && areaDetail.cooldownMinutes > 0) {
        cooldownEndAt.setMinutes(cooldownEndAt.getMinutes() + areaDetail.cooldownMinutes);
      }

      for (let j = 0; j < quantity; j++) {
        orderItemsData.push({
          productId: product.id,
          priceAtPurchase: product.price,
          status: "PENDING_PAYMENT",
          areaId,
          cooldownEndAt,
        });
      }
    }

    // Fetch the admin's wallet address for this currency
    const walletSetting = await prisma.setting.findUnique({
      where: { key: cryptoInfo.settingKey },
    });

    if (!walletSetting || !walletSetting.value) {
      return NextResponse.json({ error: "Payment method not configured for this currency" }, { status: 400 });
    }

    // Fetch estimated network fee for this currency
    const feeSetting = await prisma.setting.findUnique({
      where: { key: cryptoInfo.feeSettingKey },
    });
    const networkFee = feeSetting ? parseFloat(feeSetting.value) : 0;

    // Create master order with PENDING_PAYMENT status
    const order = await prisma.order.create({
      data: {
        userId: session.userId,
        totalAmount: totalAmountDue,
        status: "PENDING_PAYMENT",
        orderSource: "WEBSITE",
        paymentMethod: "DIRECT_CRYPTO",
        cryptoCurrency: cryptoCurrency,
        networkFee: networkFee,
        cryptoAmountDue: (totalAmountDue + networkFee).toFixed(2),
        paymentWalletAddress: walletSetting.value,
        items: {
          create: orderItemsData,
        }
      },
    });
    // Check if Cryptomus is configured
    const merchantId = process.env.CRYPTOMUS_MERCHANT_ID;
    const paymentKey = process.env.CRYPTOMUS_API_KEY;

    if (!merchantId || !paymentKey) {
      console.warn("Cryptomus not configured for crypto-checkout, falling back to manual deposit");
      return NextResponse.json({ 
        success: true, 
        order: {
          id: order.id,
          productName: cart.length > 1 ? `${firstProductName} and ${cart.length - 1} more` : firstProductName,
          totalAmount: order.totalAmount,
          currency: order.currency,
          cryptoCurrency: cryptoCurrency,
          cryptoName: cryptoInfo.name,
          network: cryptoInfo.network,
          networkFee: networkFee,
          totalDue: totalAmountDue + networkFee,
          walletAddress: walletSetting.value,
          status: order.status,
        }
      });
    }

    // Generate Cryptomus Invoice
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://camel971.com";
    const payload = {
      amount: (totalAmountDue + networkFee).toFixed(2),
      currency: "USD",
      order_id: order.id,
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
      return NextResponse.json({ error: "Failed to generate payment gateway for checkout" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      paymentUrl: data.result.url,
      order: {
        id: order.id,
        productName: cart.length > 1 ? `${firstProductName} and ${cart.length - 1} more` : firstProductName,
        totalDue: totalAmountDue + networkFee,
        status: order.status,
      }
    });

  } catch (error) {
    console.error("Crypto checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
