import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "../lib/db";
import { getStockState, escapeTelegramMarkdown as esc } from "../lib/stock";
import { createCryptoOrderForProduct, PAYMENT_WINDOW_MINUTES } from "../lib/cryptoOrder";
import { reserveProductStock, getAvailableAreasForProduct } from "../lib/stockReservation";
import { isNOWPaymentsConfigured } from "../lib/nowpayments";
import { t, BOT_LANGUAGES, isBotLanguage, languageLabel } from "../lib/botI18n";
import {
  formatMoney,
  DISPLAY_CURRENCIES,
  isDisplayCurrency,
  currencyLabel,
} from "../lib/botCurrency";
import { encryptPassword, isEncryptionConfigured } from "../lib/encryption";
import bcrypt from "bcryptjs";

// Session state storage for bot login/registration
interface AuthState {
  action: "LOGIN" | "SIGNUP" | "CHANGE_PASSWORD" | null;
  step: "CAPTCHA" | "USERNAME" | "PASSWORD" | "CURRENT_PASSWORD";
  captchaAnswer?: number;
  username?: string;
  failedAttempts?: number;
  lockedUntil?: number; // timestamp
}
const userStates = new Map<number, AuthState>();

// Pending purchase state for the optional coupon step during checkout
interface PendingPurchase {
  productId: string;
  /** Chosen delivery area. Required before an order can be placed, so bot
   *  orders move area stock the same way website orders do. */
  areaId?: string;
  areaLabel?: string;
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

  function mainMenuKeyboard(lang: string) {
    return new InlineKeyboard()
      .text(t(lang, "menu.shop"), "shop_categories")
      .text(t(lang, "menu.wallet"), "wallet_menu")
      .row()
      .text(t(lang, "menu.orders"), "orders_menu")
      .text(t(lang, "menu.disputes"), "disputes_menu")
      .row()
      .text(t(lang, "menu.settings"), "settings_menu");
  }

  async function welcomeAuthText(user: {
    username: string;
    role: string;
    language: string;
    wallet?: { balance: number; currency: string } | null;
  }) {
    const lang = user.language;
    const balance = await formatMoney(user.wallet?.balance ?? 0, user.wallet?.currency);
    return (
      `${t(lang, "menu.title")}\n\n` +
      `${t(lang, "menu.user")}: *${esc(user.username)}*\n` +
      `${t(lang, "menu.balance")}: *${balance}*\n\n` +
      `${t(lang, "menu.hint")}`
    );
  }

  /** Shape welcomeAuthText expects, built from a Prisma user row. */
  function userView(user: any) {
    return {
      username: user.username,
      role: user.role,
      language: user.language || "EN",
      wallet: user.wallet
        ? { balance: Number(user.wallet.balance), currency: user.wallet.currency || "USD" }
        : null,
    };
  }

  // 1. Start Command / Welcome Menu
  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    userStates.delete(telegramId);

    const user = await getUserByTelegram(telegramId);

    if (!user) {
      // No account yet, so no stored language preference — fall back to the
      // language Telegram reports for this user before defaulting to English.
      const guessed = (ctx.from?.language_code || "").slice(0, 2).toUpperCase();
      const lang = isBotLanguage(guessed) ? guessed : "EN";

      const welcomeNoAuth =
        `${t(lang, "welcome.title")}\n\n` +
        `${t(lang, "welcome.noAccount")} \`${telegramId}\`\n\n` +
        `${t(lang, "welcome.choose")}`;

      const keyboard = new InlineKeyboard()
        .text(t(lang, "welcome.link"), "auth_login")
        .row()
        .text(t(lang, "welcome.create"), "auth_signup");

      await ctx.reply(welcomeNoAuth, { parse_mode: "Markdown", reply_markup: keyboard });
      return;
    }

    await ctx.reply(await welcomeAuthText(userView(user)), {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(user.language || "EN"),
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
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }

    await ctx.editMessageText(await welcomeAuthText(userView(user)), {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(user.language || "EN"),
    });
    await ctx.answerCallbackQuery();
  });

  // ============================================================
  // Settings — language, display currency, profile, password
  // ============================================================
  async function renderSettings(ctx: any, user: any) {
    const lang = user.language || "EN";
    const currency = user.wallet?.currency || "USD";

    const text =
      `${t(lang, "settings.title")}\n\n` +
      `${t(lang, "settings.intro")}\n\n` +
      `${t(lang, "profile.language")}: *${esc(languageLabel(lang))}*\n` +
      `${t(lang, "profile.currency")}: *${esc(currencyLabel(currency))}*`;

    const keyboard = new InlineKeyboard()
      .text(t(lang, "settings.language"), "settings_language")
      .text(t(lang, "settings.currency"), "settings_currency")
      .row()
      .text(t(lang, "settings.profile"), "settings_profile")
      .row()
      .text(t(lang, "settings.password"), "settings_password")
      .row()
      .text(t(lang, "common.backMain"), "main_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
  }

  bot.callbackQuery("settings_menu", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }
    userStates.delete(telegramId);
    await renderSettings(ctx, user);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("settings_language", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";

    const keyboard = new InlineKeyboard();
    BOT_LANGUAGES.forEach((l, i) => {
      const mark = l.code === lang ? " ✅" : "";
      keyboard.text(`${l.label}${mark}`, `setlang_${l.code}`);
      if (i % 2 === 1) keyboard.row();
    });
    keyboard.row().text(t(lang, "common.backSettings"), "settings_menu");

    await ctx.editMessageText(t(lang, "settings.chooseLanguage"), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^setlang_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }

    const choice = ctx.match[1];
    if (!isBotLanguage(choice)) {
      await ctx.answerCallbackQuery();
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { language: choice } });
    await ctx.answerCallbackQuery({ text: t(choice, "settings.languageSet") });

    // Re-read so the settings screen renders in the language just chosen.
    const updated = await getUserByTelegram(telegramId);
    if (updated) await renderSettings(ctx, updated);
  });

  bot.callbackQuery("settings_currency", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";
    const current = user.wallet?.currency || "USD";

    const keyboard = new InlineKeyboard();
    DISPLAY_CURRENCIES.forEach((c, i) => {
      const mark = c.code === current ? " ✅" : "";
      keyboard.text(`${c.label}${mark}`, `setcur_${c.code}`);
      if (i % 2 === 1) keyboard.row();
    });
    keyboard.row().text(t(lang, "common.backSettings"), "settings_menu");

    await ctx.editMessageText(
      `${t(lang, "settings.chooseCurrency")}\n\n${t(lang, "settings.currencyNote")}`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^setcur_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";

    const choice = ctx.match[1];
    if (!isDisplayCurrency(choice) || !user.wallet) {
      await ctx.answerCallbackQuery({ text: t(lang, "common.noWallet"), show_alert: true });
      return;
    }

    // Balance is always held in USD; currency is a display preference only.
    // Same rule the website's /api/wallet/change-currency applies.
    await prisma.wallet.update({ where: { id: user.wallet.id }, data: { currency: choice } });
    await ctx.answerCallbackQuery({ text: t(lang, "settings.currencySet") });

    const updated = await getUserByTelegram(telegramId);
    if (updated) await renderSettings(ctx, updated);
  });

  bot.callbackQuery("settings_profile", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";
    const currency = user.wallet?.currency || "USD";
    const balance = await formatMoney(user.wallet?.balance ?? 0, currency);

    const text =
      `${t(lang, "profile.title")}\n\n` +
      `${t(lang, "profile.username")}: *${esc(user.username)}*\n` +
      `${t(lang, "profile.role")}: *${esc(user.role)}*\n` +
      `${t(lang, "profile.telegram")}: \`${telegramId}\`\n` +
      `${t(lang, "profile.memberSince")}: *${user.createdAt.toLocaleDateString("en-GB")}*\n` +
      `${t(lang, "profile.balance")}: *${balance}*\n` +
      `${t(lang, "profile.language")}: *${esc(languageLabel(lang))}*\n` +
      `${t(lang, "profile.currency")}: *${esc(currencyLabel(currency))}*`;

    const keyboard = new InlineKeyboard()
      .text(t(lang, "common.backSettings"), "settings_menu")
      .row()
      .text(t(lang, "common.backMain"), "main_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("settings_password", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";

    // Ask for the current password first, matching the website's
    // /api/auth/change-password, so a hijacked Telegram session alone can't
    // take over the account password.
    userStates.set(telegramId, { action: "CHANGE_PASSWORD", step: "CURRENT_PASSWORD" });
    await ctx.editMessageText(t(lang, "password.promptCurrent"), { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  // 2. Browse Shop (All Products)
  bot.callbackQuery("shop_categories", async (ctx) => {
    const telegramId = ctx.from?.id;
    const user = telegramId ? await getUserByTelegram(telegramId) : null;
    const lang = user?.language || "EN";
    const currency = user?.wallet?.currency || "USD";

    const products = await prisma.product.findMany();
    const keyboard = new InlineKeyboard();

    if (products.length === 0) {
      keyboard.text(t(lang, "common.backMain"), "main_menu");
      await ctx.editMessageText(t(lang, "shop.none"), { reply_markup: keyboard });
      await ctx.answerCallbackQuery();
      return;
    }

    let text = `${t(lang, "shop.catalog")}\n\n`;

    for (const prod of products) {
      const stockCount = prod.stockQuantity;
      const state = getStockState(stockCount);
      const price = await formatMoney(prod.price, currency);

      text +=
        `• *${esc(prod.name)}* (${esc(prod.formula || "")})\n` +
        `  ${t(lang, "shop.price")}: ${price} | ${t(lang, "shop.stock")}: ${state.replace(/_/g, " ")}\n`;

      // Show where it can actually be collected, the same way the website's
      // product page lists its areas.
      const areas = await getAvailableAreasForProduct(prod.id);
      if (areas.length > 0) {
        const list = areas
          .map((a) => `${a.areaName} (${a.stockQuantity})`)
          .join(", ");
        text += `  📍 ${esc(list)}\n`;
      }
      text += `\n`;

      if (stockCount > 0 && areas.length > 0) {
        keyboard.text(t(lang, "shop.orderBtn", { name: prod.name }).slice(0, 64), `buy_${prod.id}`).row();
      }
    }

    keyboard.text(t(lang, "common.backMain"), "main_menu");

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

  /**
   * Order summary shown once a delivery area is chosen. Shared by the area
   * picker and the coupon flow so both always show the same figures.
   */
  async function renderOrderSummary(
    ctx: any,
    user: any,
    product: any,
    pending: PendingPurchase,
    cooldownMinutes: number,
    viaReply = false
  ) {
    const lang = user.language || "EN";
    const currency = user.wallet?.currency || "USD";
    const cryptoEnabled = isNOWPaymentsConfigured();

    const basePrice = Number(product.price);
    const discount = pending.discount || 0;
    const finalAmount = parseFloat((basePrice - discount).toFixed(2));

    const keyboard = new InlineKeyboard()
      .text(t(lang, "buy.payWallet"), `confirm_${product.id}`)
      .row();
    if (cryptoEnabled) {
      keyboard.text(t(lang, "buy.payCrypto"), `paycrypto_${product.id}`).row();
    }
    if (!pending.couponCode) {
      keyboard.text(t(lang, "buy.applyCoupon"), `coupon_${product.id}`).row();
    }
    keyboard
      .text(t(lang, "common.backOrder"), `buy_${product.id}`)
      .row()
      .text(t(lang, "common.cancel"), "shop_categories");

    let text =
      `${t(lang, "buy.summary")}\n\n` +
      `${t(lang, "buy.compound")}: *${esc(product.name)}*\n` +
      `${t(lang, "area.label")}: *${esc(pending.areaLabel || "")}*\n`;

    if (cooldownMinutes > 0) {
      text += `${t(lang, "area.cooldown")}: *${t(lang, "area.minutes", { minutes: cooldownMinutes })}*\n`;
    }

    if (discount > 0) {
      text += `${t(lang, "coupon.original")}: ${await formatMoney(basePrice, currency)}\n`;
      text += `${t(lang, "coupon.discount")}: *−${await formatMoney(discount, currency)}*\n`;
      text += `*${t(lang, "coupon.newTotal")}: ${await formatMoney(finalAmount, currency)}*\n\n`;
    } else {
      text += `${t(lang, "buy.price")}: *${await formatMoney(basePrice, currency)}*\n\n`;
    }

    text += t(lang, cryptoEnabled ? "buy.chooseBoth" : "buy.chooseWallet");

    const opts = { parse_mode: "Markdown" as const, reply_markup: keyboard };
    if (viaReply) {
      await ctx.reply(text, opts);
    } else {
      await ctx.editMessageText(text, opts);
    }
  }

  // Purchase Product (Buy) — Step 1: show confirm screen with optional coupon
  bot.callbackQuery(/^buy_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
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

    const lang = user.language || "EN";

    // Preserve any coupon already typed for this product if the customer comes
    // back to change area; drop it if they switched product.
    const existing = pendingPurchases.get(telegramId);
    pendingPurchases.set(telegramId, {
      productId,
      couponCode: existing?.productId === productId ? existing.couponCode : undefined,
      discount: existing?.productId === productId ? existing.discount : undefined,
    });

    // Delivery area first, exactly like the website. Without it a bot order
    // could not decrement area stock or claim the right per-unit pickup links.
    const areas = await getAvailableAreasForProduct(productId);

    if (areas.length === 0) {
      await ctx.editMessageText(
        `${t(lang, "buy.summary")}\n\n` +
          `${t(lang, "buy.compound")}: *${esc(product.name)}*\n\n` +
          t(lang, "area.none"),
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text(t(lang, "common.backShop"), "shop_categories"),
        }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const a of areas) {
      const label =
        `${a.cityName} - ${a.areaName} (${t(lang, "area.left", { count: a.stockQuantity })})`;
      // Callback data is capped at 64 bytes, so only the area id travels here;
      // the product is already held in pendingPurchases.
      keyboard.text(label.slice(0, 64), `pickarea_${a.areaId}`).row();
    }
    keyboard.text(t(lang, "common.backShop"), "shop_categories");

    const price = await formatMoney(product.price, user.wallet?.currency);
    await ctx.editMessageText(
      `${t(lang, "area.choose")}\n\n` +
        `${t(lang, "buy.compound")}: *${esc(product.name)}*\n` +
        `${t(lang, "buy.price")}: *${price}*\n\n` +
        t(lang, "area.intro"),
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // Step 2: area chosen — show the order summary and payment options.
  bot.callbackQuery(/^pickarea_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";

    const pending = pendingPurchases.get(telegramId);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: t(lang, "common.somethingWrong"), show_alert: true });
      return;
    }

    const areaId = ctx.match[1];
    const product = await prisma.product.findUnique({ where: { id: pending.productId } });
    if (!product) {
      await ctx.answerCallbackQuery({ text: t(lang, "common.productNotFound"), show_alert: true });
      return;
    }

    // Re-read availability: the area list was rendered a moment ago and the
    // last unit may already be gone.
    const areas = await getAvailableAreasForProduct(pending.productId);
    const chosen = areas.find((a) => a.areaId === areaId);
    if (!chosen) {
      await ctx.answerCallbackQuery({ text: t(lang, "shop.outOfStock"), show_alert: true });
      return;
    }

    const areaLabel = `${chosen.cityName} - ${chosen.areaName}`;
    pendingPurchases.set(telegramId, { ...pending, areaId, areaLabel });

    await renderOrderSummary(ctx, user, product, {
      ...pending,
      areaId,
      areaLabel,
    }, chosen.cooldownMinutes);
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
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
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
    const areaId = pending?.productId === productId ? pending.areaId : undefined;

    const lang = user.language || "EN";
    const currency = user.wallet?.currency || "USD";

    // Same rule as the wallet path: no area, no order.
    if (!areaId) {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `${t(lang, "area.choose")}\n\n${t(lang, "area.intro")}`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text(t(lang, "common.backOrder"), `buy_${productId}`),
        }
      );
      return;
    }

    await ctx.answerCallbackQuery({ text: t(lang, "crypto.creating") });

    const result = await createCryptoOrderForProduct({
      userId: user.id,
      productId,
      areaId,
      couponCode,
      orderSource: "TELEGRAM",
    });

    if (!result.success || !result.paymentUrl) {
      await ctx.editMessageText(
        `${t(lang, "crypto.failed")}\n\n${esc(result.error || "")}`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text(t(lang, "common.backOrder"), `buy_${productId}`)
            .row()
            .text(t(lang, "common.backShop"), "shop_categories"),
        }
      );
      return;
    }

    pendingPurchases.delete(telegramId);

    const keyboard = new InlineKeyboard()
      .url(t(lang, "crypto.openPage"), result.paymentUrl)
      .row()
      .text(t(lang, "menu.orders"), `order_${result.orderId}`)
      .row()
      .text(t(lang, "common.backShop"), "shop_categories");

    const discountLine =
      (result.discount ?? 0) > 0
        ? `${t(lang, "coupon.discount")}: *−${await formatMoney(result.discount!, currency)}*\n`
        : "";

    await ctx.editMessageText(
      `${t(lang, "crypto.ready")}\n\n` +
        `${t(lang, "crypto.orderId")}: \`${result.orderId}\`\n` +
        `${t(lang, "buy.compound")}: *${esc(product.name)}*\n` +
        discountLine +
        `${t(lang, "crypto.amountDue")}: *${await formatMoney(result.amountDue!, currency)}*\n\n` +
        `${t(lang, "crypto.tapToPay")}\n\n` +
        t(lang, "crypto.reserved", { minutes: PAYMENT_WINDOW_MINUTES }),
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  });

  // Step 2a: prompt for coupon code
  bot.callbackQuery(/^coupon_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";
    const productId = ctx.match[1];
    // Keep the already-chosen delivery area — losing it here would send the
    // order through without an areaId and skip area stock entirely.
    const existing = pendingPurchases.get(telegramId);
    pendingPurchases.set(telegramId, {
      productId,
      areaId: existing?.productId === productId ? existing.areaId : undefined,
      areaLabel: existing?.productId === productId ? existing.areaLabel : undefined,
    });
    await ctx.editMessageText(
      `${t(lang, "coupon.title")}\n\n${t(lang, "coupon.prompt")}`,
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
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
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
    const areaId = pending?.productId === productId ? pending.areaId : undefined;

    // An order without a delivery area cannot decrement area stock or pick up
    // the right per-unit links, so send the customer back to choose one.
    if (!areaId) {
      await ctx.answerCallbackQuery();
      const lang = user.language || "EN";
      await ctx.editMessageText(
        `${t(lang, "area.choose")}\n\n${t(lang, "area.intro")}`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text(t(lang, "common.backOrder"), `buy_${productId}`),
        }
      );
      return;
    }

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

        // Moves area stock, global stock and the specific per-unit row - the
        // same helper the website uses. Previously this only decremented the
        // global count, which is why area stock never changed after a bot order
        // and the delivery cron handed out links from an arbitrary area.
        const { reservedUnitIds, cooldownMinutes } = await reserveProductStock(tx, {
          productId,
          areaId,
          quantity: 1,
          userId: user.id,
          note: "Telegram wallet order",
        });

        const cooldownEndAt = new Date(Date.now() + cooldownMinutes * 60 * 1000);

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
                  areaId,
                  stockItemId: reservedUnitIds[0] || null,
                  cooldownEndAt,
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

      const lang = user.language || "EN";
      const currency = user.wallet?.currency || "USD";

      const keyboard = new InlineKeyboard()
        .text(t(lang, "menu.orders"), `order_${order.id}`)
        .row()
        .text(t(lang, "common.backShop"), "shop_categories");

      await ctx.editMessageText(
        `${t(lang, "order.placed")}\n\n` +
          `${t(lang, "crypto.orderId")}: \`${order.id}\`\n` +
          `${t(lang, "buy.compound")}: *${esc(product.name)}*\n` +
          (discount > 0
            ? `${t(lang, "coupon.discount")}: *−${await formatMoney(discount, currency)}*\n`
            : "") +
          `${t(lang, "order.paidWallet", { amount: await formatMoney(finalAmount, currency) })}\n\n` +
          `${t(lang, "order.cooldown")}`,
        { parse_mode: "Markdown", reply_markup: keyboard }
      );
      await ctx.answerCallbackQuery({ text: t(lang, "order.placedToast") });
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
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
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

    const lang = user.language || "EN";
    const currency = user.wallet.currency || "USD";

    let text =
      `${t(lang, "wallet.title")}\n\n` +
      `${t(lang, "wallet.current")}: *${await formatMoney(user.wallet.balance, currency)}*\n\n` +
      `${t(lang, "wallet.history")}\n`;

    if (ledgers.length === 0) {
      text += t(lang, "wallet.noHistory");
    } else {
      for (const log of ledgers) {
        const amount = Number(log.amount);
        const sign = amount > 0 ? "+" : "−";
        text +=
          `• ${log.type === "DEPOSIT" || log.type === "REFUND" ? "🟢" : "🔴"} ` +
          `*${esc(log.type)}*: ${sign}${await formatMoney(Math.abs(amount), currency)} (${esc(log.description)})\n`;
      }
    }

    text += `\n\n${t(lang, "wallet.depositNote")}`;

    const siteUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
      .replace(/^["']|["']$/g, "")
      .replace(/\/+$/, "");
    const keyboard = new InlineKeyboard()
      .url(t(lang, "wallet.visit"), siteUrl)
      .row()
      .text(t(lang, "common.backMain"), "main_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // 4. Orders Menu list
  bot.callbackQuery("orders_menu", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
      return;
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    const lang = user.language || "EN";
    let text = `${t(lang, "orders.title")}\n\n`;
    const keyboard = new InlineKeyboard();

    if (orders.length === 0) {
      text += t(lang, "orders.none");
    } else {
      orders.forEach((o, index) => {
        const productName = o.items.length > 0 ? o.items[0].product.name : "Items";
        const title = o.items.length > 1 ? `${productName} +${o.items.length - 1}` : productName;
        const dateStr = o.createdAt.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
        const shortId = o.id.substring(0, 8);
        text += `${index + 1}. *#${shortId}* - ${esc(title)} (${esc(o.status)}) [${dateStr}]\n`;
        keyboard.text(t(lang, "orders.view", { id: shortId }), `order_${o.id}`).row();
      });
    }

    keyboard.text(t(lang, "common.backMain"), "main_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // View specific order details (ownership required)
  bot.callbackQuery(/^order_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
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

    const lang = user.language || "EN";
    const currency = user.wallet?.currency || "USD";

    let text =
      `${t(lang, "orderDetail.title", { id: orderId.substring(0, 8) })}\n` +
      `${t(lang, "orderDetail.value")}: *${await formatMoney(order!.totalAmount, currency)}*\n` +
      `${t(lang, "orderDetail.masterStatus")}: *${esc(order!.status)}*\n\n`;

    const keyboard = new InlineKeyboard();
    let hasCooldown = false;
    let canComplete = false;

    order!.items.forEach((item) => {
      text += `🧪 *${esc(item.product.name)}*\n`;
      text += `${t(lang, "orderDetail.status")}: *${esc(item.status)}*\n`;

      if (item.locationLink) {
        text += `${t(lang, "orderDetail.location")} [${t(lang, "orderDetail.viewMap")}](${item.locationLink})\n`;
      }
      if (item.pickupVideoUrl) {
        text += `${t(lang, "orderDetail.video")} [${t(lang, "orderDetail.watch")}](${item.pickupVideoUrl})\n`;
      }

      if (item.status === "COOLDOWN_ACTIVE") {
        hasCooldown = true;
        const secLeft = Math.max(0, Math.ceil((new Date(item.cooldownEndAt!).getTime() - Date.now()) / 1000));
        text += `${t(lang, "orderDetail.cooldownActive")}\n${t(lang, "orderDetail.eta", { seconds: secLeft })}\n`;
      } else if (item.status === "READY" || item.status === "COMPLETED") {
        text += `${t(lang, "orderDetail.ready")}\n`;
        if (item.status === "READY") canComplete = true;
      } else if (item.status === "REFUNDED") {
        text += `${t(lang, "orderDetail.refunded")}\n`;
      }
      text += `\n`;
    });

    // Let a customer who closed the invoice get back to it while the order is
    // still holding their reserved stock.
    if (order!.status === "PENDING_PAYMENT" && order!.paymentUrl) {
      text += `${t(lang, "crypto.awaiting")}\n\n`;
      keyboard.url(t(lang, "crypto.openPage"), order!.paymentUrl).row();
      keyboard.text(t(lang, "orderDetail.refresh"), `order_${order!.id}`).row();
    }

    if (hasCooldown) {
      keyboard.text(t(lang, "orderDetail.refresh"), `order_${order!.id}`).row();
    }
    if (canComplete && order!.status === "READY") {
      keyboard.text(t(lang, "orderDetail.confirm"), `complete_${order!.id}`).row();
    }

    if (order!.status === "REFUNDED") {
      text += `\n${t(lang, "orderDetail.refunded")}`;
    }

    keyboard.text(t(lang, "common.backOrders"), "orders_menu");

    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  // Complete Order — ownership required
  bot.callbackQuery(/^complete_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUserByTelegram(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
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
      await ctx.answerCallbackQuery({ text: t("EN", "common.linkFirst"), show_alert: true });
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

        // Carry the chosen delivery area through — the discount and the area
        // both have to survive to the payment step.
        const updated: PendingPurchase = {
          productId: pending.productId,
          areaId: pending.areaId,
          areaLabel: pending.areaLabel,
          couponCode: text.toUpperCase(),
          discount,
        };
        pendingPurchases.set(telegramId, updated);

        const lang = user.language || "EN";

        // Re-render the same summary the area picker produces, so the delivery
        // area stays visible and stays attached to the order.
        const areas = await getAvailableAreasForProduct(pending.productId);
        const chosen = areas.find((a) => a.areaId === updated.areaId);

        await ctx.reply(`${t(lang, "coupon.applied")}`, { parse_mode: "Markdown" });
        await renderOrderSummary(
          ctx,
          user,
          product,
          updated,
          chosen?.cooldownMinutes ?? 0,
          true
        );
      } catch (e: unknown) {
        const lang = user.language || "EN";
        const message = e instanceof Error ? e.message : "Invalid coupon";
        const keyboard = new InlineKeyboard()
          .text(t(lang, "common.backOrder"), `buy_${pending.productId}`)
          .row()
          .text(t(lang, "common.cancel"), "shop_categories");
        await ctx.reply(`❌ ${message}\n\n${t(lang, "coupon.retry")}`, { reply_markup: keyboard });
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

    // ---- Change password (from Settings) ----
    if (state.action === "CHANGE_PASSWORD") {
      const user = await getUserByTelegram(telegramId);
      if (!user) {
        userStates.delete(telegramId);
        await ctx.reply(t("EN", "common.linkFirst"));
        return;
      }
      const lang = user.language || "EN";

      // Passwords must not linger in the chat history.
      await ctx.deleteMessage().catch(() => {});

      if (state.step === "CURRENT_PASSWORD") {
        const matches = await bcrypt.compare(text, user.passwordHash);
        if (!matches) {
          const attempts = (state.failedAttempts || 0) + 1;
          if (attempts >= 3) {
            userStates.delete(telegramId);
            await ctx.reply(t(lang, "password.wrongCurrentFinal"), { parse_mode: "Markdown" });
            return;
          }
          userStates.set(telegramId, { ...state, failedAttempts: attempts });
          await ctx.reply(t(lang, "password.wrongCurrent"), { parse_mode: "Markdown" });
          return;
        }

        userStates.set(telegramId, { action: "CHANGE_PASSWORD", step: "PASSWORD" });
        await ctx.reply(t(lang, "password.prompt"), { parse_mode: "Markdown" });
        return;
      }

      if (state.step === "PASSWORD") {
        if (text.length < 8) {
          await ctx.reply(t(lang, "password.tooShort"), { parse_mode: "Markdown" });
          return;
        }

        try {
          const salt = await bcrypt.genSalt(10);
          const passwordHash = await bcrypt.hash(text, salt);

          // Keep the admin-recovery copy in step with the new password, exactly
          // as the website's change-password endpoint does.
          let passwordEncrypted: string | null = null;
          if (isEncryptionConfigured()) {
            try {
              passwordEncrypted = encryptPassword(text);
            } catch (err) {
              console.error("Failed to encrypt password:", err);
            }
          }

          await prisma.user.update({
            where: { id: user.id },
            data: passwordEncrypted ? { passwordHash, passwordEncrypted } : { passwordHash },
          });

          userStates.delete(telegramId);
          await ctx.reply(t(lang, "password.changed"), {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text(t(lang, "common.backMain"), "main_menu"),
          });
        } catch (err) {
          console.error("Bot change-password error:", err);
          userStates.delete(telegramId);
          await ctx.reply(t(lang, "password.failed"), { parse_mode: "Markdown" });
        }
        return;
      }
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
