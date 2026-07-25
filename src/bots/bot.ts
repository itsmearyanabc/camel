import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "../lib/db";
import { getStockState, escapeTelegramMarkdown as esc } from "../lib/stock";
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
    ctx.reply("⚠️ Something went wrong. Please try again later or type /start.").catch(() => {});
  });

  async function getUserByTelegram(telegramId: number) {
    return prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
      include: { wallet: true },
    });
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
      `🧪 *Camel971* - Main Menu (${esc(botName)})\n\n` +
      `User: *${esc(user.username)}* | Role: *${esc(user.role)}*\n` +
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

  // 2. Shop Categories
  bot.callbackQuery("shop_categories", async (ctx) => {
    const categories = await prisma.category.findMany();
    const keyboard = new InlineKeyboard();

    categories.forEach((cat) => {
      keyboard.text(`🧪 ${cat.name}`, `cat_${cat.id}`).row();
    });

    keyboard.text("⬅️ Back to Main Menu", "main_menu");

    await ctx.editMessageText("Select a Chemical Category:", { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^cat_(.+)$/, async (ctx) => {
    const catId = ctx.match[1];
    const category = await prisma.category.findUnique({
      where: { id: catId },
      include: {
        products: {
          include: {
            items: { where: { isAllocated: false } },
          },
        },
      },
    });

    if (!category) {
      await ctx.answerCallbackQuery({ text: "Category not found", show_alert: true });
      return;
    }

    const keyboard = new InlineKeyboard();
    let text = `🧪 *${esc(category.name)} Catalog*:\n\n`;

    category.products.forEach((prod) => {
      const stockCount = prod.items.length;
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

  // Purchase Product (Buy)
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

    try {
      const order = await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });
        if (!wallet || Number(wallet.balance) < Number(product.price)) {
          throw new Error(
            `Insufficient wallet balance.\n\nPlease log in to our website to pay directly with Crypto (BTC, ETH, USDT, SOL, TRX) or to deposit funds.`
          );
        }
        if (wallet.currency !== product.currency) {
          throw new Error(`This item is priced in ${product.currency}, but your wallet uses ${wallet.currency}. Currency conversion is not available.`);
        }

        const item = await tx.inventoryItem.findFirst({
          where: { productId, isAllocated: false },
          orderBy: { createdAt: "asc" },
        });

        if (!item) {
          throw new Error("This compound is currently out of stock.");
        }

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: Number(product.price) } },
        });

        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "PURCHASE",
            amount: -Number(product.price),
            description: `Telegram Bot Order: ${product.name}`,
          },
        });

        const claimed = await tx.inventoryItem.updateMany({
          where: { id: item.id, isAllocated: false },
          data: { isAllocated: true, allocatedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new Error("This item was just purchased by another customer. Please try again.");
        }

        const unallocatedCount = await tx.inventoryItem.count({
          where: { productId, isAllocated: false },
        });

        await tx.product.update({
          where: { id: productId },
          data: { stockState: getStockState(unallocatedCount) },
        });

        return tx.order.create({
          data: {
            userId: user.id,
            totalAmount: product.price,
            status: "COOLDOWN_ACTIVE",
            orderSource: "TELEGRAM",
            paymentMethod: "WALLET",
            items: {
              create: [
                {
                  productId: product.id,
                  inventoryItemId: item.id,
                  priceAtPurchase: product.price,
                  status: "COOLDOWN_ACTIVE",
                  cooldownEndAt: new Date(Date.now() + 30 * 1000),
                }
              ]
            }
          },
        });
      });

      const keyboard = new InlineKeyboard()
        .text("📦 Track Order Status", `order_${order.id}`)
        .row()
        .text("⬅️ Back to Shop", "shop_categories");

      await ctx.editMessageText(
        `✅ *Order Placed!*\n\n` +
          `Order ID: \`${order.id}\`\n` +
          `Compound: *${esc(product.name)}*\n` +
          `Paid: *$${Number(product.price).toFixed(2)}* (from Wallet)\n\n` +
          `⚠️ *Order Cooldown is Active.* Your pickup details will be generated in 30 seconds.`,
        { parse_mode: "Markdown", reply_markup: keyboard }
      );
      await ctx.answerCallbackQuery({ text: "Order placed!" });
    } catch (e: unknown) {
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
      orders.forEach((o) => {
        const productName = o.items.length > 0 ? o.items[0].product.name : "Items";
        const title = o.items.length > 1 ? `${productName} +${o.items.length - 1}` : productName;
        text += `• *Order #${o.id.substring(0, 8)}...* - ${esc(title)} (${esc(o.status)})\n`;
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
      include: { items: { include: { product: true, inventoryItem: true } } },
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
        include: { items: { include: { product: true, inventoryItem: true } } },
      });
      if (order && order.items.every(i => i.status === "READY" || i.status === "COMPLETED")) {
        order = await prisma.order.update({
          where: { id: orderId },
          data: { status: "READY" },
          include: { items: { include: { product: true, inventoryItem: true } } },
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
      
      if (item.status === "COOLDOWN_ACTIVE") {
        hasCooldown = true;
        const secLeft = Math.max(0, Math.ceil((new Date(item.cooldownEndAt!).getTime() - Date.now()) / 1000));
        text += `⚠️ *Cooldown Timer Active.*\nEstimated delivery details in: *${secLeft} seconds*.\n`;
      } else if (item.status === "READY" || item.status === "COMPLETED") {
        text += `📍 *FIFO Batch Pickup Details*:\n`;
        text += `🔑 *Locker/Serial Code:* \`${item.inventoryItem?.data ?? "N/A"}\`\n`;
        text += `📌 *Coordinates/Location:* \`${item.inventoryItem?.locationData || "N/A"}\`\n`;
        if (item.status === "READY") canComplete = true;
      } else if (item.status === "REFUNDED") {
        text += `ℹ️ *Refund credited.*\n`;
      }
      text += `\n`;
    });

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
      include: { items: { include: { product: true, inventoryItem: true } } },
    });

    if (!order) return;

    let text =
      `📦 *Order Details (#${order.id.substring(0,8)})*\n` +
      `Value: *$${Number(order.totalAmount).toFixed(2)}*\n` +
      `Master Status: *${esc(order.status)}*\n\n`;

    order.items.forEach((item) => {
      text += `🧪 *${esc(item.product.name)}*\n`;
      text += `Status: *${esc(item.status)}*\n`;
      text += `📍 *FIFO Batch Pickup Details*:\n`;
      text += `🔑 *Locker/Serial Code:* \`${item.inventoryItem?.data ?? "N/A"}\`\n`;
      text += `📌 *Coordinates/Location:* \`${item.inventoryItem?.locationData || "N/A"}\`\n\n`;
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

  // Handle text messages for Login / Signup state machine
  bot.on("message:text", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const state = userStates.get(telegramId);
    if (!state) return;

    const text = ctx.message.text.trim();

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
                passwordPlain: text,
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
