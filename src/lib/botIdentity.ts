/**
 * Which Telegram bot the storefront points customers at.
 *
 * Every `t.me/...` link in the UI comes from here so that swapping the shop
 * bot is one edit plus an env change, rather than a hunt through the pages.
 * The home page and the footer used to hardcode the handle, which meant a bot
 * swap left two prominent links sending customers to the previous bot.
 *
 * Deliberately free of server-only imports (no prisma, unlike
 * src/lib/telegramLinks.ts) so client components can import it too.
 *
 * The literal `process.env.NEXT_PUBLIC_…` expression below is load-bearing:
 * Next inlines exactly that form into the browser bundle at `next build`, and
 * leaves destructured or computed lookups alone - those would reach the
 * browser as undefined. Two consequences follow from it being a build-time
 * value: editing the variable on the server does nothing until the next
 * `next build`, and the fallback is what ships if the variable is missing at
 * build time.
 *
 * DEFAULT_BOT_USERNAME must therefore be kept in step with
 * NEXT_PUBLIC_TELEGRAM_BOT_USERNAME in .env. A stale fallback is worse than no
 * fallback: it silently sends customers to a bot the shop no longer runs.
 */
const DEFAULT_BOT_USERNAME = "Camel_prod_bot";

/** Bare username of the shop bot, with no leading "@". */
export const BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || DEFAULT_BOT_USERNAME;

/** Absolute link to the shop bot, for hrefs. */
export const BOT_LINK = `https://t.me/${BOT_USERNAME}`;
