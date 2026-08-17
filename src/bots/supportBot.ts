import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "../lib/db";
import { escapeTelegramMarkdown as esc } from "../lib/stock";
import { t } from "../lib/botI18n";

/**
 * Customer-support bot.
 *
 * Separate process-level bot from the shop bot in src/bots/bot.ts, running on
 * its own token. It does one job: turn a customer's problem into a ticket the
 * team can answer.
 *
 * A "ticket" is a Dispute row - the same records the control panel's Disputes
 * tab already lists and that STAFF can already read and resolve. Nothing new
 * had to be built on the admin side, and a ticket raised here is
 * indistinguishable from one raised on the website.
 *
 * Dispute.orderId is required by the schema, so every flow settles which order
 * the ticket is about before creating it - exactly what the website's own
 * "Raise a Ticket" form does with its required order picker.
 *
 * Telegram user ids are global rather than per-bot, so a customer who linked
 * their account through the shop bot is recognised here automatically; there
 * is no second linking step.
 */

/** The problems customers actually report, in the order they report them. */
const CATEGORIES = [
  { code: "payment", key: "support.cat.payment" },
  { code: "notreceived", key: "support.cat.notReceived" },
  { code: "location", key: "support.cat.wrongLocation" },
  { code: "stuck", key: "support.cat.stuck" },
  { code: "refund", key: "support.cat.refund" },
  { code: "account", key: "support.cat.account" },
  { code: "other", key: "support.cat.other" },
] as const;

/** Statuses that mean a ticket is still being handled. */
const OPEN_STATUSES = ["OPEN", "INVESTIGATING"];

const MIN_DESCRIPTION = 10;
const MAX_DESCRIPTION = 2000;

interface SupportState {
  step: "DESCRIBE" | "REPLY";
  categoryKey?: string;
  orderId?: string;
  disputeId?: string;
  startedAt: number;
}

const states = new Map<number, SupportState>();

// Abandoned half-finished tickets would otherwise pin a state entry forever,
// and a customer returning hours later would have their next message swallowed
// into a flow they no longer remember starting.
const STATE_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, state] of states.entries()) {
    if (now - state.startedAt > STATE_TTL_MS) states.delete(id);
  }
}, 10 * 60 * 1000);

function categoryLabel(lang: string, code: string): string {
  const found = CATEGORIES.find((c) => c.code === code);
  return found ? t(lang, found.key) : t(lang, "support.cat.other");
}

export function createSupportBot(token: string, botName: string) {
  const bot = new Bot(token);

  bot.catch((err) => {
    const text = String((err.error as any)?.message || err.error || "");
    // Re-rendering an identical screen is not a fault worth reporting.
    if (text.includes("message is not modified")) return;
    console.error(`[${botName}] Error in update ${err.ctx.update.update_id}:`, err.error);
    err.ctx.reply("⚠️ Something went wrong. Please send /start to begin again.").catch(() => {});
  });

  async function getUser(telegramId: number) {
    return prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
  }

  function mainMenu(lang: string) {
    return new InlineKeyboard()
      .text(t(lang, "support.raise"), "sup_raise")
      .row()
      .text(t(lang, "support.myTickets"), "sup_tickets");
  }

  async function showMenu(ctx: any, lang: string, viaReply: boolean) {
    const text = `${t(lang, "support.welcome")}\n\n${t(lang, "support.intro")}`;
    const opts = { parse_mode: "Markdown" as const, reply_markup: mainMenu(lang) };
    if (viaReply) await ctx.reply(text, opts);
    else await ctx.editMessageText(text, opts);
  }

  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    states.delete(telegramId);

    const user = await getUser(telegramId);
    if (!user) {
      await ctx.reply(t("EN", "support.notLinked"), { parse_mode: "Markdown" });
      return;
    }
    await showMenu(ctx, user.language || "EN", true);
  });

  bot.command("cancel", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    const lang = user?.language || "EN";
    states.delete(telegramId);
    await ctx.reply(t(lang, "support.cancelled"), {
      parse_mode: "Markdown",
      reply_markup: mainMenu(lang),
    });
  });

  bot.callbackQuery("sup_menu", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "support.notLinked"), show_alert: true });
      return;
    }
    states.delete(telegramId);
    await showMenu(ctx, user.language || "EN", false);
    await ctx.answerCallbackQuery();
  });

  // ---- Raise a ticket: step 1, pick the problem -----------------------------
  bot.callbackQuery("sup_raise", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "support.notLinked"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";

    const keyboard = new InlineKeyboard();
    for (const category of CATEGORIES) {
      keyboard.text(t(lang, category.key), `sup_cat_${category.code}`).row();
    }
    keyboard.text(t(lang, "support.backMenu"), "sup_menu");

    await ctx.editMessageText(
      `${t(lang, "support.chooseProblem")}\n\n${t(lang, "support.chooseProblemHint")}`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // ---- Step 2: pick the order ----------------------------------------------
  bot.callbackQuery(/^sup_cat_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "support.notLinked"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";
    const code = ctx.match[1];

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: { items: { include: { product: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    // An account or login problem is not about a purchase, and a customer who
    // has not ordered yet still needs help - both skip straight to describing
    // the problem and raise a ticket with no order attached.
    if (code === "account" || orders.length === 0) {
      states.set(telegramId, { step: "DESCRIBE", categoryKey: code, startedAt: Date.now() });
      await ctx.editMessageText(
        `${t(lang, "support.describe")}\n\n` +
          `${t(lang, "support.status")}: *${esc(categoryLabel(lang, code))}*` +
          (orders.length === 0 ? `\n\n_${esc(t(lang, "support.noOrdersNote"))}_` : ""),
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text(t(lang, "support.backMenu"), "sup_menu"),
        }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const order of orders) {
      const first = order.items[0]?.product.name || "Order";
      const extra = order.items.length > 1 ? ` +${order.items.length - 1}` : "";
      const label = `#${order.id.slice(0, 8)} · ${first}${extra}`;
      // Callback data is capped at 64 bytes, so only the ids travel.
      keyboard.text(label.slice(0, 60), `sup_ord_${code}_${order.id}`).row();
    }
    // Not every problem maps onto one order - "something else" often does not.
    keyboard.text(t(lang, "support.noOrderOption"), `sup_noorder_${code}`).row();
    keyboard.text(t(lang, "support.backMenu"), "sup_raise");

    await ctx.editMessageText(
      `${t(lang, "support.chooseOrder")}\n\n` +
        `${t(lang, "support.chooseProblem").replace(/[*_]/g, "")}: *${esc(categoryLabel(lang, code))}*\n\n` +
        t(lang, "support.chooseOrderHint"),
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // "Not about a specific order" — raise the ticket with no order attached.
  bot.callbackQuery(/^sup_noorder_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "support.notLinked"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";
    const code = ctx.match[1];

    states.set(telegramId, { step: "DESCRIBE", categoryKey: code, startedAt: Date.now() });
    await ctx.editMessageText(
      `${t(lang, "support.describe")}\n\n${t(lang, "support.status")}: *${esc(categoryLabel(lang, code))}*`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text(t(lang, "support.backMenu"), "sup_menu"),
      }
    );
    await ctx.answerCallbackQuery();
  });

  // ---- Step 3: ask for the description -------------------------------------
  bot.callbackQuery(/^sup_ord_([a-z]+)_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "support.notLinked"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";
    const [, code, orderId] = ctx.match;

    // Ownership is re-checked here rather than trusted from the callback: the
    // order id travels through the client, so a crafted callback could
    // otherwise attach a ticket to somebody else's order.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== user.id) {
      await ctx.answerCallbackQuery({ text: t(lang, "common.orderNotFound"), show_alert: true });
      return;
    }

    // The website refuses a second open dispute per order; matching that here
    // keeps one conversation per problem instead of splitting it in two.
    const existing = await prisma.dispute.findFirst({
      where: { orderId, status: { in: OPEN_STATUSES } },
    });
    if (existing) {
      states.set(telegramId, { step: "REPLY", disputeId: existing.id, startedAt: Date.now() });
      await ctx.editMessageText(
        `${t(lang, "support.alreadyOpen")}\n\n${t(lang, "support.replyPrompt")}`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text(t(lang, "support.backMenu"), "sup_menu"),
        }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    states.set(telegramId, {
      step: "DESCRIBE",
      categoryKey: code,
      orderId,
      startedAt: Date.now(),
    });

    await ctx.editMessageText(
      `${t(lang, "support.describe")}\n\n` +
        `${t(lang, "support.status")}: *${esc(categoryLabel(lang, code))}* · \`#${order.id.slice(0, 8)}\``,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text(t(lang, "support.backMenu"), "sup_menu"),
      }
    );
    await ctx.answerCallbackQuery();
  });

  // ---- My tickets -----------------------------------------------------------
  bot.callbackQuery("sup_tickets", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "support.notLinked"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";
    states.delete(telegramId);

    const disputes = await prisma.dispute.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    const keyboard = new InlineKeyboard();
    let text = `${t(lang, "support.ticketsTitle")}\n\n`;

    if (disputes.length === 0) {
      text += t(lang, "support.ticketsNone");
    } else {
      for (const dispute of disputes) {
        text +=
          `• \`#${dispute.id.slice(0, 8)}\` — *${esc(dispute.status)}*\n` +
          `  ${esc(dispute.reason.slice(0, 70))}\n\n`;
        keyboard
          .text(t(lang, "support.ticketView", { id: dispute.id.slice(0, 8) }), `sup_view_${dispute.id}`)
          .row();
      }
    }

    keyboard.text(t(lang, "support.backMenu"), "sup_menu");
    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^sup_view_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "support.notLinked"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";

    const dispute = await prisma.dispute.findUnique({
      where: { id: ctx.match[1] },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    });
    if (!dispute || dispute.userId !== user.id) {
      await ctx.answerCallbackQuery({ text: t(lang, "common.orderNotFound"), show_alert: true });
      return;
    }

    let text =
      `🎫 *${esc(t(lang, "support.ticketView", { id: dispute.id.slice(0, 8) }))}*\n` +
      `${t(lang, "support.status")}: *${esc(dispute.status)}*\n\n`;
    for (const message of dispute.messages) {
      const who = message.senderRole === "ADMIN" ? "🛟" : "👤";
      text += `${who} *${esc(message.senderName)}*: ${esc(message.message)}\n\n`;
    }
    if (dispute.status === "RESOLVED") text += `_${esc(t(lang, "support.resolvedNote"))}_`;

    const keyboard = new InlineKeyboard();
    if (dispute.status !== "RESOLVED") {
      keyboard.text(t(lang, "support.reply"), `sup_reply_${dispute.id}`).row();
    }
    keyboard.text(t(lang, "support.myTickets"), "sup_tickets");

    // Telegram rejects anything past 4096 characters outright, which would
    // leave the customer looking at nothing at all.
    await ctx.editMessageText(text.slice(0, 4000), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^sup_reply_(.+)$/, async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("EN", "support.notLinked"), show_alert: true });
      return;
    }
    const lang = user.language || "EN";

    const dispute = await prisma.dispute.findUnique({ where: { id: ctx.match[1] } });
    if (!dispute || dispute.userId !== user.id || dispute.status === "RESOLVED") {
      await ctx.answerCallbackQuery({ text: t(lang, "support.failed"), show_alert: true });
      return;
    }

    states.set(telegramId, { step: "REPLY", disputeId: dispute.id, startedAt: Date.now() });
    await ctx.editMessageText(t(lang, "support.replyPrompt"), {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text(t(lang, "support.backMenu"), "sup_menu"),
    });
    await ctx.answerCallbackQuery();
  });

  // ---- Free text: the description, or a reply ------------------------------
  bot.on("message:text", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const state = states.get(telegramId);
    // Without a flow in progress there is nothing to attach the text to, so
    // point the customer at the menu rather than silently dropping it.
    const user = await getUser(telegramId);
    if (!user) {
      await ctx.reply(t("EN", "support.notLinked"), { parse_mode: "Markdown" });
      return;
    }
    const lang = user.language || "EN";

    if (!state) {
      await showMenu(ctx, lang, true);
      return;
    }

    const body = ctx.message.text.trim();
    if (body.length < MIN_DESCRIPTION) {
      await ctx.reply(t(lang, "support.tooShort"));
      return;
    }
    const message = body.slice(0, MAX_DESCRIPTION);

    try {
      if (state.step === "REPLY" && state.disputeId) {
        const dispute = await prisma.dispute.findUnique({ where: { id: state.disputeId } });
        if (!dispute || dispute.userId !== user.id || dispute.status === "RESOLVED") {
          states.delete(telegramId);
          await ctx.reply(t(lang, "support.failed"), { reply_markup: mainMenu(lang) });
          return;
        }

        await prisma.disputeMessage.create({
          data: {
            disputeId: dispute.id,
            senderRole: "CUSTOMER",
            senderName: user.username,
            message,
          },
        });
        // Bump the dispute so it sorts to the top of the admin list, which is
        // ordered by updatedAt - a reply nobody notices is a reply lost.
        await prisma.dispute.update({
          where: { id: dispute.id },
          data: { updatedAt: new Date() },
        });

        states.delete(telegramId);
        await ctx.reply(t(lang, "support.replySent"), {
          parse_mode: "Markdown",
          reply_markup: mainMenu(lang),
        });
        return;
      }

      if (state.step === "DESCRIBE" && state.categoryKey) {
        // `orderId` is optional: an account problem, or a customer who has not
        // ordered yet, raises a ticket with no order behind it.
        let order = null;
        if (state.orderId) {
          order = await prisma.order.findUnique({ where: { id: state.orderId } });
          if (!order || order.userId !== user.id) {
            states.delete(telegramId);
            await ctx.reply(t(lang, "support.failed"), { reply_markup: mainMenu(lang) });
            return;
          }
        } else {
          // No order to key a duplicate check on, so cap the open ones instead -
          // the same limit /api/disputes/submit applies.
          const openGeneral = await prisma.dispute.count({
            where: { userId: user.id, orderId: null, status: { in: OPEN_STATUSES } },
          });
          if (openGeneral >= 3) {
            states.delete(telegramId);
            await ctx.reply(t(lang, "support.tooManyOpen"), {
              parse_mode: "Markdown",
              reply_markup: mainMenu(lang),
            });
            return;
          }
        }

        const label = categoryLabel("EN", state.categoryKey);
        // The category is stored in English inside `reason` on purpose: it is
        // read by the support team in the control panel, not by the customer.
        const reason = `[${label}] ${message}`;

        const dispute = await prisma.$transaction(async (tx) => {
          // Re-check inside the transaction: the customer may have opened a
          // ticket from the website while typing this one.
          if (order) {
            const clash = await tx.dispute.findFirst({
              where: { orderId: order.id, status: { in: OPEN_STATUSES } },
            });
            if (clash) return clash;
          }

          const created = await tx.dispute.create({
            data: { orderId: order?.id ?? null, userId: user.id, reason, status: "OPEN" },
          });
          await tx.disputeMessage.create({
            data: {
              disputeId: created.id,
              senderRole: "CUSTOMER",
              senderName: user.username,
              message: reason,
            },
          });
          return created;
        });

        states.delete(telegramId);
        await ctx.reply(
          `${t(lang, "support.created")}\n\n` +
            (order
              ? t(lang, "support.createdBody", {
                  id: dispute.id.slice(0, 8),
                  order: order.id.slice(0, 8),
                })
              : t(lang, "support.createdBodyGeneral", { id: dispute.id.slice(0, 8) })),
          { parse_mode: "Markdown", reply_markup: mainMenu(lang) }
        );
        return;
      }

      states.delete(telegramId);
      await showMenu(ctx, lang, true);
    } catch (err) {
      console.error(`[${botName}] Failed to record support message:`, err);
      states.delete(telegramId);
      await ctx.reply(t(lang, "support.failed"), { reply_markup: mainMenu(lang) });
    }
  });

  return bot;
}
