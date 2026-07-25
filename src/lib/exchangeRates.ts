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
  return ratesCache || {
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
