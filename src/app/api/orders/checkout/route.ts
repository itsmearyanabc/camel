import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { cart, paymentMethod } = await req.json();
    
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    // Process checkout using database transactions to avoid race conditions
    const order = await prisma.$transaction(async (tx) => {
      // 1. Fetch user wallet
      const wallet = await tx.wallet.findUnique({
        where: { userId: session.userId },
      });

      if (!wallet) throw new Error("Wallet not found.");

      let totalAmountDue = 0;
      const orderItemsData = [];
      const updatedProductIds: string[] = [];

      // 2. Validate inventory and calculate total price
      for (const cartItem of cart) {
        const { productId, quantity } = cartItem;
        
        const product = await tx.product.findUnique({
          where: { id: productId },
        });

        if (!product) throw new Error(`Product not found: ${productId}`);

        if (product.stockQuantity < quantity) {
          throw new Error(`Not enough stock for ${product.name}. Requested: ${quantity}, Available: ${product.stockQuantity}`);
        }

        const itemCost = Number(product.price);
        totalAmountDue += itemCost * quantity;

        for (let i = 0; i < quantity; i++) {
          orderItemsData.push({
            productId: product.id,
            priceAtPurchase: product.price,
            status: "ORDERED",
          });
        }
        
        if (!updatedProductIds.includes(product.id)) {
          updatedProductIds.push(product.id);
        }
        
        // Deduct stock
        await tx.product.update({
          where: { id: product.id },
          data: { stockQuantity: { decrement: quantity } }
        });
      }

      // 3. Handle Wallet Payment
      if (paymentMethod === "WALLET") {
        if (Number(wallet.balance) < totalAmountDue) {
          throw new Error("Insufficient wallet balance. Please deposit funds or select Crypto.");
        }

        // Deduct from wallet balance
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: totalAmountDue } },
        });

        // Create ledger entry
        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "PURCHASE",
            amount: -totalAmountDue,
            description: `Checkout of ${cart.length} item(s)`,
          },
        });
      }

      // 4. Create Master Order and OrderItems
      const createdOrder = await tx.order.create({
        data: {
          userId: session.userId,
          totalAmount: totalAmountDue,
          status: "ORDERED",
          orderSource: "WEBSITE",
          paymentMethod: paymentMethod || "WALLET",
          items: {
            create: orderItemsData.map(item => ({
              ...item,
              status: "ORDERED"
            })),
          },
        },
        include: {
          items: {
            include: { product: true }
          }
        },
      });

      return createdOrder;
    });

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    const msg = error?.message || "";
    const isUserError = msg.includes("Insufficient") || msg.includes("Not enough stock") || msg.includes("another customer");
    return NextResponse.json({ error: isUserError ? msg : "Checkout failed" }, { status: isUserError ? 400 : 500 });
  }
}
