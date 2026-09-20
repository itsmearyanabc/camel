// Cache memory for exchange rates to avoid hitting the API on every request
let ratesCache: Record<string, number> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches real-time exchange rates against USD.
 * @returns A record of currency codes to their USD multiplier.
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();
  
  if (ratesCache && (now - lastFetchTime < CACHE_DURATION_MS)) {
    return ratesCache;
  }

  try {
    // Free, no-auth API for exchange rates (Base USD)
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data && data.rates) {
      ratesCache = data.rates;
      lastFetchTime = now;
      return ratesCache!;
    }
  } catch (error) {
    console.error("Error fetching exchange rates, falling back to 1:1:", error);
  }

  // Fallback if API fails — approximate rates so prices aren't shown 1:1
  // AED is pegged to the dollar at 3.6725 and has been since 1997, so unlike
  // the others this fallback is not an approximation - it is the rate. It
  // matters more than the rest too: AED is the default display currency, so a
  // missing entry here would silently show dirham prices at dollar numbers.
  return ratesCache || {
    AED: 3.6725,
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    RUB: 87.5,
    UAH: 41.3,
    KZT: 450,
    TRY: 34.2,
  };
}

/**
 * Gets the specific multiplier for a target currency from USD.
 */
export async function getCurrencyMultiplier(currencyCode: string): Promise<number> {
  if (currencyCode === "USD") return 1;
  const rates = await getExchangeRates();
  return rates[currencyCode] || 1;
}

/**
 * The display currency AND its rate, as one value.
 *
 * Every endpoint that ships a wallet to the dashboard must go through this.
 * The dashboard multiplies each price by wallet.exchangeRate, so an endpoint
 * that returns a currency WITHOUT its rate silently prices the entire
 * storefront at 1:1 - which is exactly how dirham labels ended up sitting on
 * dollar numbers: /api/auth/me computed the rate, /api/dashboard/init did not,
 * and both call setUser on the same page.
 *
 * Returning the pair together is what stops the two drifting again: there is
 * no longer a way to select a currency and forget its rate.
 */
export async function resolveWalletDisplay(
  currency: string | null | undefined
): Promise<{ currency: string; exchangeRate: number }> {
  const { DEFAULT_CURRENCY } = await import("./currencies");
  const code = currency || DEFAULT_CURRENCY;
  return { currency: code, exchangeRate: await getCurrencyMultiplier(code) };
}
