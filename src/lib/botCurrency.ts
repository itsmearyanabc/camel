// Relative imports on purpose: shared with the Telegram bot, which runs under
// tsx and does not resolve the "@/" path alias.
import { getCurrencyMultiplier } from "./exchangeRates";
import { DEFAULT_CURRENCY, joinCurrencySymbol } from "./currencies";

/**
 * Currencies a customer can display amounts in.
 *
 * Deliberately the same list the website's /api/wallet/change-currency accepts,
 * so a currency chosen in the bot is valid on the website and vice versa.
 * Balances are always *held* in USD - this is a display preference only.
 */
export const DISPLAY_CURRENCIES = [
  { code: "AED", symbol: "AED", label: "🇦🇪 UAE Dirham" },
  { code: "USD", symbol: "$", label: "🇺🇸 US Dollar" },
  { code: "EUR", symbol: "€", label: "🇪🇺 Euro" },
  { code: "RUB", symbol: "₽", label: "🇷🇺 Ruble" },
  { code: "UAH", symbol: "₴", label: "🇺🇦 Hryvnia" },
  { code: "KZT", symbol: "₸", label: "🇰🇿 Tenge" },
  { code: "TRY", symbol: "₺", label: "🇹🇷 Lira" },
] as const;

/** Fallback entry for a wallet whose currency is missing or no longer offered. */
const DEFAULT_ENTRY =
  DISPLAY_CURRENCIES.find((c) => c.code === DEFAULT_CURRENCY) ?? DISPLAY_CURRENCIES[0];

export function isDisplayCurrency(code: unknown): boolean {
  return typeof code === "string" && DISPLAY_CURRENCIES.some((c) => c.code === code);
}

export function currencySymbol(code: string | null | undefined): string {
  return DISPLAY_CURRENCIES.find((c) => c.code === code)?.symbol ?? DEFAULT_ENTRY.symbol;
}

export function currencyLabel(code: string | null | undefined): string {
  return DISPLAY_CURRENCIES.find((c) => c.code === code)?.label ?? DEFAULT_ENTRY.label;
}

/**
 * Format a USD amount in the customer's chosen display currency.
 *
 * Mirrors formatPrice() in lib/currencies.ts, but resolves the rate server-side
 * because the bot has no client context to read one from. Rates are cached for
 * an hour inside getExchangeRates(), so this is cheap to call per message.
 */
export async function formatMoney(
  amountUsd: number | string | { toString(): string },
  currencyCode: string | null | undefined
): Promise<string> {
  const code = isDisplayCurrency(currencyCode) ? String(currencyCode) : DEFAULT_CURRENCY;
  const usd = Number(amountUsd) || 0;

  if (code === "USD") {
    return `$${usd.toFixed(2)}`;
  }

  const rate = await getCurrencyMultiplier(code);
  const converted = usd * rate;

  // Minor units are meaningless for these high-denomination currencies, and
  // showing them just makes the message noisier.
  const decimals = converted >= 1000 ? 0 : 2;
  return joinCurrencySymbol(currencySymbol(code), converted.toFixed(decimals));
}
