export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}

/**
 * Display currency a brand-new account starts on, before anyone chooses.
 *
 * USD, matching the unit balances and prices are actually held in, so a
 * customer who never touches the picker sees numbers that need no conversion.
 * Every other currency in FIAT_CURRENCIES - AED included - is one click away in
 * the dashboard picker and converts at the live rate.
 *
 * Kept in step with Wallet.currency's @default in prisma/schema.prisma and the
 * column default applied by src/lib/schemaBootstrap.ts.
 */
export const DEFAULT_CURRENCY = "USD";

/**
 * The currency every balance, price and invoice is actually HELD in.
 *
 * Deliberately separate from DEFAULT_CURRENCY, which is only what a customer
 * is shown. Wallet balances, product prices, order totals, admin adjustments
 * and the NOWPayments invoice are all denominated in this; a display currency
 * is a presentation layer, converted at the live rate and never stored.
 *
 * Anything comparing or arithmetic-ing money must use THIS, never a wallet's
 * display preference. Confusing the two is how a purchase ends up refused
 * because the customer switched the label on their balance.
 */
export const SETTLEMENT_CURRENCY = "USD";

export const FIAT_CURRENCIES: Record<string, CurrencyInfo> = {
  AED: { code: "AED", symbol: "AED", name: "UAE Dirham" },
  USD: { code: "USD", symbol: "$", name: "US Dollar" },
  EUR: { code: "EUR", symbol: "€", name: "Euro" },
  RUB: { code: "RUB", symbol: "₽", name: "Ruble" },
  UAH: { code: "UAH", symbol: "₴", name: "Hryvnia" },
  KZT: { code: "KZT", symbol: "₸", name: "Tenge" },
  TRY: { code: "TRY", symbol: "₺", name: "Lira" },
};

export function getCurrencySymbol(code: string): string {
  return FIAT_CURRENCIES[code]?.symbol || "$";
}

/**
 * Join a currency symbol to an already-formatted amount.
 *
 * "AED" is a three-letter code standing in for a symbol, and "AED183.63" reads
 * as one token rather than as a price, so alphabetic symbols take a space.
 * Single-glyph symbols ($, €, ₽) stay flush against the number, which is what
 * people expect to see.
 */
export function joinCurrencySymbol(symbol: string, amount: string): string {
  return /[A-Za-z]$/.test(symbol) ? `${symbol} ${amount}` : `${symbol}${amount}`;
}

// currencyCode and exchangeRate default together on purpose: USD at a rate of 1
// is the only self-consistent pair. Defaulting the code to AED while the rate
// stayed 1 would print a dirham symbol against a dollar number.
export function formatPrice(amount: number | string | any, currencyCode = "USD", exchangeRate = 1): string {
  const convertedAmount = Number(amount) * exchangeRate;
  return joinCurrencySymbol(getCurrencySymbol(currencyCode), convertedAmount.toFixed(2));
}

export interface CryptoInfo {
  code: string;
  name: string;
  network: string;
  settingKey: string;
  feeSettingKey: string;
  icon: string;
}

export const CRYPTO_CURRENCIES: CryptoInfo[] = [
  { code: "BTC", name: "Bitcoin", network: "Bitcoin", settingKey: "WALLET_BTC", feeSettingKey: "FEE_BTC", icon: "â¿" },
  { code: "ETH", name: "Ethereum", network: "Ethereum", settingKey: "WALLET_ETH", feeSettingKey: "FEE_ETH", icon: "Î" },
  { code: "USDT_ERC20", name: "USDT (ERC-20)", network: "Ethereum", settingKey: "WALLET_USDT_ERC20", feeSettingKey: "FEE_USDT_ERC20", icon: "â®" },
  { code: "USDT_TRC20", name: "USDT (TRC-20)", network: "Tron", settingKey: "WALLET_USDT_TRC20", feeSettingKey: "FEE_USDT_TRC20", icon: "â®" },
  { code: "SOL", name: "Solana", network: "Solana", settingKey: "WALLET_SOL", feeSettingKey: "FEE_SOL", icon: "â" },
  { code: "TRX", name: "Tron", network: "Tron", settingKey: "WALLET_TRX", feeSettingKey: "FEE_TRX", icon: "â" },
];

export function getCryptoInfo(code: string): CryptoInfo | undefined {
  return CRYPTO_CURRENCIES.find((currency) => currency.code === code);
}
