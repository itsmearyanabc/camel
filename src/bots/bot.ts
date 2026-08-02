import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "../lib/db";
import { getStockState, escapeTelegramMarkdown as esc } from "../lib/stock";
import { createCryptoOrderForProduct, PAYMENT_WINDOW_MINUTES } from "../lib/cryptoOrder";
import { isNOWPaymentsConfigured } from "../lib/nowpayments";
import bcrypt from "bcryptjs";

// Session state storage for bot login/registration
interface AuthState {
  action: "LOGIN" | "SIGNUP" | null;
  step: "CAPTCHA" | "USERNAME" | "PASSWORD";
  captchaAnswer?: number;
  username?: string;
  failedAttempts?: number;
  lockedUntil?: number; // timestamp
}
const userStates = new Map<number, AuthState>();

// Pending purchase state for the optional coupon step during checkout
interface PendingPurchase {
  productId: string;
  couponCode?: string;
  discount?: number;
}
const pendingPurchases = new Map<number, PendingPurchase>();

// Clean up stale auth states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of userStates.entries()) {
    // Remove states older than 10 minutes or expired locks
    if (state.lockedUntil && state.lockedUntil < now) {
      userStates.delete(key);
    }
  }
}, 10 * 60 * 1000);

export function createTelegramBot(token: string, botName: string) {
  const bot = new Bot(token);

  // Global error handler — keeps the bot alive and logs the real cause
  bot.catch((err) => {
    const ctx = err.ctx;
    const errText = String((err.error as any)?.message || err.error || "");
    if (errText.includes("message is not modified")) {
      return;
    }
    console.error(`[${botName}] Error in update ${ctx.update.update_id}:`, err.error);
    ctx.reply(`⚠️ Something went wrong: ${errText}\n\nPlease try again later or type /start.`).catch(() => {});
  });

  async function getUserByTelegram(telegramId: number) {
    return prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
      include: { wallet: true },
    });
  }

  // Validate a coupon for a user against an order amount. Returns discount or throws.
  async function validateCouponForUser(code: string, userId: string, orderAmount: number) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: { couponUsages: { where: { userId } } },
    });
    if (!coupon) throw new Error("Invalid coupon code.");
    if (!coupon.isActive) throw new Error("This coupon is no longer active.");
    const now = new Date();
    if (coupon.validFrom > now) throw new Error("This coupon is not yet valid.");
    if (coupon.validUntil && coupon.validUntil < now) throw new Error("This coupon has expired.");
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error("This coupon has reached its usage limit.");
    if (coupon.userLimit && coupon.couponUsages.length >= coupon.userLimit) throw new Error("You have already used this coupon the maximum number of times.");
    if (coupon.minOrderAmount && orderAmount < Number(coupon.minOrderAmount)) {
      throw new Error(`Minimum order amount of $${Number(coupon.minOrderAmount).toFixed(2)} required for this coupon.`);
    }

    let discount = 0;
    if (coupon.discountType === "PERCENTAGE") {
      discount = (orderAmount * Number(coupon.discountValue)) / 100;
      if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) discount = Number(coupon.maxDiscount);
    } else if (coupon.discountType === "FIXED_AMOUNT") {
      discount = Number(coupon.discountValue);
      if (discount > orderAmount) discount = orderAmount;
    }
    return { coupon, discount: parseFloat(discount.toFixed(2)) };
  }

  function mainMenuKeyboard() {
    return new InlineKeyboard()
      .text("🧪 Browse Shop", "shop_categories")
      .text("💳 Wallet & Ledger", "wallet_menu")
      .row()
      .text("📦 Track Orders", "orders_menu")
      .text("⚖️ Disputes Log", "disputes_menu");
  }

  function welcomeAuthText(user: { username: string; role: string; wallet?: { balance: number } | null }) {
    return (
      `🧪 *Camel971* - Main Menu\n\n` +
      `User: *${esc(user.username)}*\n` +
      `Wallet Balance: *$${(user.wallet?.balance ?? 0).toFixed(2)}*\n\n` +
      `Manage your orders, browse stock, or raise disputes below.`
    );
  }

  // 1. Start Command / Welcome Menu
  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    userStates.delete(telegramId);

    const user = await getUserByTelegram(telegramId);

    if (!user) {
      const welcomeNoAuth =
        `👋 Welcome to *Camel971* (Camel971 Bot)!\n\n` +
        `We could not find an account linked to your Telegram ID: \`${telegramId}\`.\n\n` +
        `Choose an option below to get started:`;

      const keyboard = new InlineKeyboard()
        .text("🔑 Link Existing Account", "auth_login")
        .row()
        .text("📝 Create New Account", "auth_signup");

      await ctx.reply(welcomeNoAuth, { parse_mode: "Markdown", reply_markup: keyboard });
      return;
    }

    await ctx.reply(welcomeAuthText({
      username: user.username,
      role: user.role,
      wallet: user.wallet ? { balance: Number(user.wallet.balance) } : null,
    }), {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.callbackQuery("auth_login", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const num1 = Math.floor(Math.random() * 9) + 1;
    const num2 = Math.floor(Math.random() * 9) + 1;
    const sum = num1 + num2;

    userStates.set(telegramId, { action: "LOGIN", step: "CAPTCHA", captchaAnswer: sum });
    await ctx.editMessageText(
      `🤖 *Security Verification*\n\n` +
        `Solve the mathematical verification (same as website):\n` +
        `*What is ${num1} + ${num2}?*`,
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("auth_signup", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const num1 = Math.floor(Math.random() * 9) + 1;
    const num2 = Math.floor(Math.random() * 9) + 1;
    const sum = num1 + num2;

    userStates.set(telegramId, { action: "SIGNUP", step: "CAPTCHA", captchaAnswer: sum });
    await ctx.editMessageText(
      `🤖 *Security Verification*\n\n` +
        `Solve the mathematical verification (same as website):\n` +
        `*What is ${num1} + ${num2}?*`,
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("main_menu", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }

    await ctx.editMessageText(welcomeAuthText({
      username: user.username,
      role: user.role,
      wallet: user.wallet ? { balance: Number(user.wallet.balance) } : null,
    }), {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  // 2. Browse Shop (All Products)
  bot.callbackQuery("shop_categories", async (ctx) => {
    const products = await prisma.product.findMany();
    const keyboard = new InlineKeyboard();

    if (products.length === 0) {
      keyboard.text("⬅️ Back to Main Menu", "main_menu");
      await ctx.editMessageText("No products available currently.", { reply_markup: keyboard });
      await ctx.answerCallbackQuery();
      return;
    }

    let text = `🧪 *Complete Catalog*:\n\n`;

    products.forEach((prod) => {
      const stockCount = prod.stockQuantity;
      const state = getStockState(stockCount);
      text +=
        `• *${esc(prod.name)}* (${esc(prod.formula || "")})\n` +
        `  Price: $${Number(prod.price).toFixed(2)} | Stock: ${state.replace(/_/g, " ")}\n\n`;

      if (stockCount > 0) {
        keyboard.text(`Order ${prod.name}`.slice(0, 64), `buy_${prod.id}`).row();
      }
    });

    keyboard.text("⬅️ Back to Main Menu", "main_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^cat_(.+)$/, async (ctx) => {
    const catId = ctx.match[1];
    const category = await prisma.category.findUnique({
      where: { id: catId },
      include: {
        products: true,
      },
    });

    if (!category) {
      await ctx.answerCallbackQuery({ text: "Category not found", show_alert: true });
      return;
    }

    const keyboard = new InlineKeyboard();
    let text = `🧪 *${esc(category.name)} Catalog*:\n\n`;

    category.products.forEach((prod) => {
      const stockCount = prod.stockQuantity;
      const state = getStockState(stockCount);
      text +=
        `• *${esc(prod.name)}* (${esc(prod.formula || "")})\n` +
        `  Price: $${Number(prod.price).toFixed(2)} | Stock: ${state.replace(/_/g, " ")}\n\n`;

      if (stockCount > 0) {
        keyboard.text(`Order ${prod.name}`.slice(0, 64), `buy_${prod.id}`).row();
      }
    });

    keyboard.text("⬅️ Back to Categories", "shop_categories");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // Purchase Product (Buy) — Step 1: show confirm screen with optional coupon
  bot.callbackQuery(/^buy_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }

    const productId = ctx.match[1];
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      await ctx.answerCallbackQuery({ text: "Product not found", show_alert: true });
      return;
    }
    if (product.stockQuantity < 1) {
      await ctx.answerCallbackQuery({ text: "This compound is currently out of stock.", show_alert: true });
      return;
    }

    pendingPurchases.set(telegramId, { productId });

    const cryptoEnabled = isNOWPaymentsConfigured();

    const keyboard = new InlineKeyboard()
      .text("💳 Pay from Wallet", `confirm_${productId}`)
      .row();
    if (cryptoEnabled) {
      keyboard.text("₿ Pay with Crypto", `paycrypto_${productId}`).row();
    }
    keyboard
      .text("🎟️ Apply Coupon", `coupon_${productId}`)
      .row()
      .text("❌ Cancel", "shop_categories");

    await ctx.editMessageText(
      `🧪 *Order Summary*\n\n` +
        `Compound: *${esc(product.name)}*\n` +
        `Price: *$${Number(product.price).toFixed(2)}*\n\n` +
        `You can apply a coupon code for a discount, then choose how to pay` +
        (cryptoEnabled ? ` — from your wallet balance, or directly with crypto.` : ` from your wallet.`),
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // Step 3b: pay for the order directly with crypto via NOWPayments.
  // Creates a PENDING_PAYMENT order that reserves the unit, then hands the
  // customer a hosted invoice link. Confirmation arrives via the IPN webhook,
  // which notifies this chat - the bot never marks an order paid itself.
  bot.callbackQuery(/^paycrypto_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }

    const productId = ctx.match[1];
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      await ctx.answerCallbackQuery({ text: "Product not found", show_alert: true });
      return;
    }

    const pending = pendingPurchases.get(telegramId);
    const couponCode = pending?.productId === productId ? pending.couponCode : undefined;

    await ctx.answerCallbackQuery({ text: "Creating your invoice..." });

    const result = await createCryptoOrderForProduct({
      userId: user.id,
      productId,
      couponCode,
      orderSource: "TELEGRAM",
    });

    if (!result.success || !result.paymentUrl) {
      await ctx.editMessageText(
        `❌ *Could not start crypto payment*\n\n${esc(result.error || "Please try again.")}`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("⬅️ Back to Order", `buy_${productId}`)
            .row()
            .text("🧪 Back to Shop", "shop_categories"),
        }
      );
      return;
    }

    pendingPurchases.delete(telegramId);

    const keyboard = new InlineKeyboard()
      .url("💰 Open Payment Page", result.paymentUrl)
      .row()
      .text("📦 Track Order Status", `order_${result.orderId}`)
      .row()
      .text("🧪 Back to Shop", "shop_categories");

    await ctx.editMessageText(
      `₿ *Crypto Payment Ready*\n\n` +
        `Order ID: \`${result.orderId}\`\n` +
        `Compound: *${esc(product.name)}*\n` +
        ((result.discount ?? 0) > 0 ? `Discount: *−$${result.discount!.toFixed(2)}*\n` : "") +
        `Amount Due: *$${result.amountDue!.toFixed(2)}*\n\n` +
        `Tap *Open Payment Page* to pay with any supported coin.\n\n` +
        `⏳ This item is reserved for you for *${PAYMENT_WINDOW_MINUTES} minutes*. ` +
        `You will get a message here as soon as your payment is confirmed.`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  });

  // Step 2a: prompt for coupon code
  bot.callbackQuery(/^coupon_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }
    const productId = ctx.match[1];
    pendingPurchases.set(telegramId, { productId });
    await ctx.editMessageText(
      `🎟️ *Apply Coupon*\n\nPlease type your coupon code now (or type /cancel to go back).`,
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
  });

  // Step 3: confirm & place the order (with or without coupon)
  bot.callbackQuery(/^confirm_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }

    const productId = ctx.match[1];
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      await ctx.answerCallbackQuery({ text: "Product not found", show_alert: true });
      return;
    }

    const pending = pendingPurchases.get(telegramId);
    const couponCode = pending?.productId === productId ? pending.couponCode : undefined;

    try {
      const { order, finalAmount, discount } = await prisma.$transaction(async (tx) => {
        const dbProduct = await tx.product.findUnique({ where: { id: productId } });
        if (!dbProduct || dbProduct.stockQuantity < 1) {
          throw new Error("This compound is currently out of stock.");
        }

        const basePrice = Number(product.price);
        let discount = 0;
        let coupon: any = null;
        if (couponCode) {
          const res = await validateCouponForUser(couponCode, user.id, basePrice);
          coupon = res.coupon;
          discount = res.discount;
        }
        const finalAmount = parseFloat((basePrice - discount).toFixed(2));

        const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });
        if (!wallet || Number(wallet.balance) < finalAmount) {
          throw new Error(
            isNOWPaymentsConfigured()
              ? `Insufficient wallet balance.\n\nGo back and choose "Pay with Crypto" to pay for this order directly.`
              : `Insufficient wallet balance.\n\nPlease log in to our website to deposit funds.`
          );
        }
        if (wallet.currency !== product.currency) {
          throw new Error(`This item is priced in ${product.currency}, but your wallet uses ${wallet.currency}. Currency conversion is not available.`);
        }

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: finalAmount } },
        });

        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "PURCHASE",
            amount: -finalAmount,
            description: `Telegram Bot Order: ${product.name}` + (coupon ? ` (Coupon ${coupon.code})` : ""),
          },
        });

        await tx.product.update({
          where: { id: productId },
          data: { stockQuantity: { decrement: 1 } },
        });

        const order = await tx.order.create({
          data: {
            userId: user.id,
            totalAmount: finalAmount,
            status: "COOLDOWN_ACTIVE",
            orderSource: "TELEGRAM",
            paymentMethod: "WALLET",
            items: {
              create: [
                {
                  productId: product.id,
                  priceAtPurchase: finalAmount,
                  status: "COOLDOWN_ACTIVE",
                  cooldownEndAt: new Date(Date.now() + 30 * 1000),
                }
              ]
            }
          },
        });

        if (coupon && discount > 0) {
          await tx.couponUsage.create({
            data: { couponId: coupon.id, userId: user.id, orderId: order.id, discount },
          });
          await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
        }

        return { order, finalAmount, discount };
      });

      pendingPurchases.delete(telegramId);

      const keyboard = new InlineKeyboard()
        .text("📦 Track Order Status", `order_${order.id}`)
        .row()
        .text("⬅️ Back to Shop", "shop_categories");

      await ctx.editMessageText(
        `✅ *Order Placed!*\n\n` +
          `Order ID: \`${order.id}\`\n` +
          `Compound: *${esc(product.name)}*\n` +
          (discount > 0 ? `Discount: *−$${discount.toFixed(2)}*\n` : "") +
          `Paid: *$${finalAmount.toFixed(2)}* (from Wallet)\n\n` +
          `⚠️ *Order Cooldown is Active.* Your pickup details will be generated in 30 seconds.`,
        { parse_mode: "Markdown", reply_markup: keyboard }
      );
      await ctx.answerCallbackQuery({ text: "Order placed!" });
    } catch (e: unknown) {
      pendingPurchases.delete(telegramId);
      const message = e instanceof Error ? e.message : "Checkout failed";
      await ctx.answerCallbackQuery({ text: `❌ ${message}`.slice(0, 200), show_alert: true });
    }
  });

  // 3. Wallet Menu
  bot.callbackQuery("wallet_menu", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }
    if (!user.wallet) {
      await ctx.answerCallbackQuery({ text: "No wallet found for this account.", show_alert: true });
      return;
    }

    const ledgers = await prisma.walletLedger.findMany({
      where: { walletId: user.wallet.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    let text =
      `💳 *Wallet Information*\n\n` +
      `Current Balance: *$${Number(user.wallet?.balance ?? 0).toFixed(2)}*\n\n` +
      `*Recent Ledger History*:\n`;

    if (ledgers.length === 0) {
      text += `_No recent wallet actions recorded._`;
    } else {
      ledgers.forEach((log) => {
        const sign = Number(log.amount) > 0 ? "+" : "";
        text +=
          `• ${log.type === "DEPOSIT" || log.type === "REFUND" ? "🟢" : "🔴"} ` +
          `*${esc(log.type)}*: ${sign}$${Number(log.amount).toFixed(2)} (${esc(log.description)})\n`;
      });
    }

    text += `\n\nℹ️ *To deposit funds using Crypto (BTC, ETH, SOL, etc.), please log in to our website.*`;

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/^["']|["']$/g, "");
    const keyboard = new InlineKeyboard()
      .url("🌐 Visit Website to Deposit", siteUrl)
      .row()
      .text("⬅️ Back to Main Menu", "main_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // 4. Orders Menu list
  bot.callbackQuery("orders_menu", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    let text = `📦 *Your Active & Past Orders*:\n\n`;
    const keyboard = new InlineKeyboard();

    if (orders.length === 0) {
      text += `_No orders found. Buy chemical compounds in the Shop._`;
    } else {
      orders.forEach((o, index) => {
        const productName = o.items.length > 0 ? o.items[0].product.name : "Items";
        const title = o.items.length > 1 ? `${productName} +${o.items.length - 1}` : productName;
        const dateStr = o.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        text += `${index + 1}. *Order #${o.id.substring(0, 8)}...* - ${esc(title)} (${esc(o.status)}) [${dateStr}]\n`;
        keyboard.text(`View #${o.id.substring(0, 8)}`, `order_${o.id}`).row();
      });
    }

    keyboard.text("⬅️ Back to Main Menu", "main_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // View specific order details (ownership required)
  bot.callbackQuery(/^order_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }

    const orderId = ctx.match[1];
    let order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order || order.userId !== user.id) {
      await ctx.answerCallbackQuery({ text: "Order not found", show_alert: true });
      return;
    }

    let itemsUpdated = false;
    for (const item of order.items) {
      if (item.status === "COOLDOWN_ACTIVE" && item.cooldownEndAt) {
        if (new Date() >= item.cooldownEndAt) {
          await prisma.orderItem.update({
            where: { id: item.id },
            data: { status: "READY" },
          });
          itemsUpdated = true;
        }
      }
    }

    if (itemsUpdated) {
      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } } },
      });
      if (order && order.items.every(i => i.status === "READY" || i.status === "COMPLETED")) {
        order = await prisma.order.update({
          where: { id: orderId },
          data: { status: "READY" },
          include: { items: { include: { product: true } } },
        });
      }
    }

    let text =
      `📦 *Order Details (#${orderId.substring(0,8)})*\n` +
      `Value: *$${Number(order!.totalAmount).toFixed(2)}*\n` +
      `Master Status: *${esc(order!.status)}*\n\n`;

    const keyboard = new InlineKeyboard();
    let hasCooldown = false;
    let canComplete = false;

    order!.items.forEach((item) => {
      text += `🧪 *${esc(item.product.name)}*\n`;
      text += `Status: *${esc(item.status)}*\n`;
      
      if (item.locationLink) {
        text += `🗺️ *Location:* [View on Map](${item.locationLink})\n`;
      }
      if (item.pickupVideoUrl) {
        text += `🎥 *Video Guide:* [Watch Video](${item.pickupVideoUrl})\n`;
      }
      
      if (item.status === "COOLDOWN_ACTIVE") {
        hasCooldown = true;
        const secLeft = Math.max(0, Math.ceil((new Date(item.cooldownEndAt!).getTime() - Date.now()) / 1000));
        text += `⚠️ *Cooldown Timer Active.*\nEstimated delivery details in: *${secLeft} seconds*.\n`;
      } else if (item.status === "READY" || item.status === "COMPLETED") {
        text += `📍 *Ready for collection*\n`;
        if (item.status === "READY") canComplete = true;
      } else if (item.status === "REFUNDED") {
        text += `ℹ️ *Refund credited.*\n`;
      }
      text += `\n`;
    });

    // Let a customer who closed the invoice get back to it while the order is
    // still holding their reserved stock.
    if (order!.status === "PENDING_PAYMENT" && order!.paymentUrl) {
      text +=
        `⏳ *Awaiting payment.* Your item is reserved until you pay or the ` +
        `payment window expires.\n\n`;
      keyboard.url("💰 Open Payment Page", order!.paymentUrl).row();
      keyboard.text("🔄 Refresh Status", `order_${order!.id}`).row();
    }

    if (hasCooldown) {
      keyboard.text("🔄 Refresh Status", `order_${order!.id}`).row();
    }
    if (canComplete && order!.status === "READY") {
      keyboard.text("✅ Confirm Collection (Complete All)", `complete_${order!.id}`).row();
    }

    if (order!.status === "REFUNDED") {
      text += `\nℹ️ *Refund credited.* The dispute was resolved and the money was returned to your wallet balance.`;
    }

    keyboard.text("⬅️ Back to Orders List", "orders_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // Complete Order — ownership required
  bot.callbackQuery(/^complete_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }

    const orderId = ctx.match[1];
    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existing || existing.userId !== user.id) {
      await ctx.answerCallbackQuery({ text: "Order not found", show_alert: true });
      return;
    }
    if (existing.status !== "READY") {
      await ctx.answerCallbackQuery({ text: "Order is not ready to complete", show_alert: true });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { orderId: orderId, status: "READY" },
        data: { status: "COMPLETED" },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED" },
      });
    });

    await ctx.answerCallbackQuery({ text: "🎉 Order marked as Completed!" });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) return;

    let text =
      `📦 *Order Details (#${order.id.substring(0,8)})*\n` +
      `Value: *$${Number(order.totalAmount).toFixed(2)}*\n` +
      `Master Status: *${esc(order.status)}*\n\n`;

    order.items.forEach((item) => {
      text += `🧪 *${esc(item.product.name)}*\n`;
      text += `Status: *${esc(item.status)}*\n`;
      
      if (item.locationLink) {
        text += `🗺️ *Location:* [View on Map](${item.locationLink})\n`;
      }
      if (item.pickupVideoUrl) {
        text += `🎥 *Video Guide:* [Watch Video](${item.pickupVideoUrl})\n`;
      }
      
      text += `📍 *Ready for collection*\n\n`;
    });

    const keyboard = new InlineKeyboard().text("⬅️ Back to Orders List", "orders_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
  });

  // 5. Disputes Menu
  bot.callbackQuery("disputes_menu", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Please /start and link your account first.", show_alert: true });
      return;
    }

    const disputes = await prisma.dispute.findMany({
      where: { userId: user.id },
      include: { order: { include: { items: { include: { product: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    let text = `⚖️ *Your Disputes tickets*:\n\n`;

    if (disputes.length === 0) {
      text += `_No disputes submitted._`;
    } else {
      disputes.forEach((d) => {
        const productName = d.order.items.length > 0 ? d.order.items[0].product.name : "Items";
        const title = d.order.items.length > 1 ? `${productName} +${d.order.items.length - 1}` : productName;
        text += `• *Dispute for ${esc(title)}* - [${esc(d.status)}]\n  Claim: "${esc(d.reason)}"\n`;
        if (d.status === "RESOLVED" && d.resolutionType) {
          text += `  Resolution: *${esc(d.resolutionType)}*\n`;
        }
        text += `\n`;
      });
    }

    const keyboard = new InlineKeyboard().text("⬅️ Back to Main Menu", "main_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // Handle text messages for Login / Signup state machine + coupon entry
  bot.on("message:text", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const text = ctx.message.text.trim();

    // Coupon entry takes priority (a purchase is in progress awaiting a code)
    const pending = pendingPurchases.get(telegramId);
    if (pending && !pending.couponCode) {
      if (text === "/cancel") {
        pendingPurchases.delete(telegramId);
        await ctx.reply("❌ Coupon entry cancelled. Your order was not placed. Browse the shop with /start.");
        return;
      }
      const user = await getUserByTelegram(telegramId);
      if (!user) {
        pendingPurchases.delete(telegramId);
        await ctx.reply("❌ Account not linked. Type /start.");
        return;
      }
      const product = await prisma.product.findUnique({ where: { id: pending.productId } });
      if (!product) {
        pendingPurchases.delete(telegramId);
        await ctx.reply("❌ Product no longer available.");
        return;
      }
      try {
        const { discount } = await validateCouponForUser(text, user.id, Number(product.price));
        const finalAmount = parseFloat((Number(product.price) - discount).toFixed(2));
        pendingPurchases.set(telegramId, { productId: pending.productId, couponCode: text.toUpperCase(), discount });

        // Keep both payment routes available after a coupon is applied - the
        // discount is carried on pendingPurchases and honoured by either.
        const keyboard = new InlineKeyboard()
          .text("💳 Pay from Wallet", `confirm_${pending.productId}`)
          .row();
        if (isNOWPaymentsConfigured()) {
          keyboard.text("₿ Pay with Crypto", `paycrypto_${pending.productId}`).row();
        }
        keyboard.text("❌ Cancel", "shop_categories");

        await ctx.reply(
          `🎟️ *Coupon Applied!*\n\n` +
            `Compound: *${esc(product.name)}*\n` +
            `Original Price: $${Number(product.price).toFixed(2)}\n` +
            `Discount: *−$${discount.toFixed(2)}*\n` +
            `*New Total: $${finalAmount.toFixed(2)}*\n\n` +
            `Choose how you would like to pay.`,
          { parse_mode: "Markdown", reply_markup: keyboard }
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Invalid coupon";
        const keyboard = new InlineKeyboard()
          .text("⬅️ Back to Order", `buy_${pending.productId}`)
          .row()
          .text("❌ Cancel", "shop_categories");
        await ctx.reply(`❌ ${message}\n\nTry another code, or go back.`, { reply_markup: keyboard });
      }
      return;
    }

    const state = userStates.get(telegramId);
    if (!state) return;

    if (text === "/cancel") {
      userStates.delete(telegramId);
      await ctx.reply("❌ Authentication cancelled. Type /start to try again.");
      return;
    }

    if (state.step === "CAPTCHA") {
      const answer = parseInt(text, 10);
      if (isNaN(answer) || answer !== state.captchaAnswer) {
        userStates.delete(telegramId);
        await ctx.reply("❌ Incorrect CAPTCHA verification. Authentication cancelled. Type /start to try again.");
        return;
      }

      userStates.set(telegramId, { ...state, step: "USERNAME" });
      if (state.action === "LOGIN") {
        await ctx.reply("🔑 Please enter your website Username:");
      } else {
        await ctx.reply("📝 Please enter a new Username for your account (minimum 3 characters):");
      }
      return;
    }

    if (state.action === "LOGIN") {
      if (state.step === "USERNAME") {
        const user = await prisma.user.findUnique({ where: { username: text } });
        if (!user) {
          await ctx.reply("❌ Username not found on website. Please enter your website Username (or type /cancel):");
          return;
        }
        userStates.set(telegramId, { action: "LOGIN", step: "PASSWORD", username: text });
        await ctx.reply("🔑 Please enter your Password:");
      } else if (state.step === "PASSWORD") {
        const username = state.username!;

        // Brute-force protection: lock after 5 failed attempts for 15 minutes
        if (state.lockedUntil && Date.now() < state.lockedUntil) {
          const secLeft = Math.ceil((state.lockedUntil - Date.now()) / 1000);
          await ctx.reply(`❌ Too many failed attempts. Please wait ${secLeft} seconds or type /cancel.`);
          return;
        }

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
          userStates.delete(telegramId);
          await ctx.reply("❌ User not found. Please start over with /start.");
          return;
        }

        const passwordMatch = await bcrypt.compare(text, user.passwordHash);
        if (!passwordMatch) {
          const attempts = (state.failedAttempts || 0) + 1;
          if (attempts >= 5) {
            userStates.set(telegramId, {
              ...state,
              failedAttempts: attempts,
              lockedUntil: Date.now() + 15 * 60 * 1000, // 15 min lockout
            });
            await ctx.reply("❌ Too many failed password attempts. Account locked for 15 minutes. Type /cancel to restart.");
          } else {
            userStates.set(telegramId, { ...state, failedAttempts: attempts });
            await ctx.reply(`❌ Incorrect password (${attempts}/5 attempts). Please try again (or type /cancel):`);
          }
          return;
        }

        const linkedElsewhere = await prisma.user.findUnique({
          where: { telegramId: String(telegramId) },
        });
        if (linkedElsewhere && linkedElsewhere.id !== user.id) {
          userStates.delete(telegramId);
          await ctx.reply(
            "❌ This Telegram account is already linked to a different website user. Unlink it from the dashboard first, then try again."
          );
          return;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            telegramId: String(telegramId),
            telegramUsername: ctx.from.username || null,
          },
        });

        userStates.delete(telegramId);
        await ctx.reply(
          "✅ Success! Your Telegram account has been linked to your website profile. Type /start to open the Shop!"
        );
      }
    } else if (state.action === "SIGNUP") {
      if (state.step === "USERNAME") {
        if (text.length < 3) {
          await ctx.reply("❌ Username must be at least 3 characters. Please enter a different Username:");
          return;
        }

        const existingUser = await prisma.user.findUnique({ where: { username: text } });
        if (existingUser) {
          await ctx.reply("❌ Username is already taken on the website. Please choose a different Username:");
          return;
        }

        userStates.set(telegramId, { action: "SIGNUP", step: "PASSWORD", username: text });
        await ctx.reply("🔑 Please enter a new Password (minimum 6 characters):");
      } else if (state.step === "PASSWORD") {
        if (text.length < 6) {
          await ctx.reply("❌ Password must be at least 6 characters. Please enter your password again:");
          return;
        }

        const alreadyLinked = await prisma.user.findUnique({
          where: { telegramId: String(telegramId) },
        });
        if (alreadyLinked) {
          userStates.delete(telegramId);
          await ctx.reply(
            "❌ This Telegram account is already linked. Type /start to open the shop, or link a different account from the website."
          );
          return;
        }

        const username = state.username!;
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(text, salt);

        try {
          await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
              data: {
                username,
                passwordHash,
                telegramId: String(telegramId),
                telegramUsername: ctx.from.username || null,
                role: "CUSTOMER",
              },
            });

            await tx.wallet.create({
              data: {
                userId: user.id,
                balance: 0.0,
              },
            });
          });
        } catch (error: any) {
          userStates.delete(telegramId);
          if (error.code === "P2002") {
            await ctx.reply("❌ Username or Telegram ID is already taken. Please try again with /start.");
          } else {
            await ctx.reply("❌ An unexpected error occurred during signup. Please try again later.");
          }
          return;
        }

        userStates.delete(telegramId);
        await ctx.reply(
          "🎉 Account successfully registered and linked! You can now access all services. Type /start to open the Shop!"
        );
      }
    }
  });

  return bot;
}
