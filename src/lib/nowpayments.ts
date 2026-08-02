import crypto from "crypto";

const NOWPAYMENTS_API_KEY = (process.env.NOWPAYMENTS_API_KEY || "").trim();
const NOWPAYMENTS_IPN_SECRET = (process.env.NOWPAYMENTS_IPN_SECRET || "").trim();

// Sandbox and production are entirely separate environments (separate API key AND
// separate IPN secret). Mixing them fails signature verification silently.
const NOWPAYMENTS_API_URL =
  process.env.NOWPAYMENTS_SANDBOX === "true"
    ? "https://api-sandbox.nowpayments.io/v1"
    : "https://api.nowpayments.io/v1";

/**
 * Public base URL of this deployment, used to build the IPN callback and the
 * success/cancel redirects handed to NOWPayments.
 *
 * APP_URL is checked first and is the one to set in production. `NEXT_PUBLIC_*`
 * values are inlined into the bundle at `next build` and then frozen - editing
 * them on the server and restarting has no effect - so relying on them here
 * means a rebuild-order mistake silently sends the IPN callback to the wrong
 * host and payments are taken but never confirmed. APP_URL has no such prefix,
 * so it is read from the environment at runtime, every time.
 *
 * The NEXT_PUBLIC_ names stay as fallbacks for existing deployments: the code
 * previously read NEXT_PUBLIC_APP_URL while the rest of the app sets
 * NEXT_PUBLIC_SITE_URL, so both are accepted.
 */
export function getPublicBaseUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  // Values copied out of dashboards frequently arrive quoted and/or with a slash.
  return raw.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
}

export interface NOWPaymentInvoice {
  id: string;
  order_id: string;
  order_description: string;
  price_amount: number | string;
  price_currency: string;
  pay_currency: string | null;
  ipn_callback_url: string;
  invoice_url: string;
  success_url: string;
  cancel_url: string;
  created_at: string;
  updated_at: string;
}

export interface NOWPaymentStatus {
  payment_id: number | string;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid?: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  purchase_id: string;
  created_at: string;
  updated_at: string;
  outcome_amount?: number;
  outcome_currency?: string;
}

/**
 * Create a hosted payment invoice.
 *
 * `payCurrency` is intentionally optional: when omitted NOWPayments renders a
 * coin picker on the hosted invoice page, which is what lets a customer pay with
 * any supported cryptocurrency rather than being locked to one we pre-selected.
 */
export async function createNOWPaymentInvoice(params: {
  priceAmount: number;
  priceCurrency: string;
  payCurrency?: string | null;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ success: boolean; invoice?: NOWPaymentInvoice; error?: string }> {
  try {
    if (!NOWPAYMENTS_API_KEY) {
      return { success: false, error: "NOWPayments API key not configured" };
    }

    const body: Record<string, unknown> = {
      price_amount: params.priceAmount,
      price_currency: params.priceCurrency,
      order_id: params.orderId,
      order_description: params.orderDescription,
      ipn_callback_url: params.ipnCallbackUrl,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    };

    // Only pin a coin when the caller actually asked for one. Sending
    // pay_currency: null makes the API reject the invoice.
    if (params.payCurrency) {
      body.pay_currency = params.payCurrency;
    }

    const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NOWPAYMENTS_API_KEY,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("NOWPayments API error:", response.status, data);
      return {
        success: false,
        error: data?.message || `NOWPayments returned ${response.status}`,
      };
    }

    if (!data?.invoice_url) {
      console.error("NOWPayments invoice missing invoice_url:", data);
      return { success: false, error: "NOWPayments did not return a payment URL" };
    }

    return { success: true, invoice: data };
  } catch (error) {
    console.error("NOWPayments invoice creation error:", error);
    return { success: false, error: "Failed to create payment invoice" };
  }
}

/**
 * Fetch the authoritative state of a payment straight from NOWPayments.
 * Used to re-verify webhook claims and to reconcile orders out of band.
 */
export async function getNOWPaymentStatus(paymentId: string | number): Promise<{
  success: boolean;
  status?: NOWPaymentStatus;
  error?: string;
}> {
  try {
    if (!NOWPAYMENTS_API_KEY) {
      return { success: false, error: "NOWPayments API key not configured" };
    }

    const response = await fetch(`${NOWPAYMENTS_API_URL}/payment/${paymentId}`, {
      method: "GET",
      headers: { "x-api-key": NOWPAYMENTS_API_KEY },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("NOWPayments status check error:", response.status, data);
      return {
        success: false,
        error: data?.message || `NOWPayments returned ${response.status}`,
      };
    }

    return { success: true, status: data };
  } catch (error) {
    console.error("NOWPayments status check error:", error);
    return { success: false, error: "Failed to check payment status" };
  }
}

/**
 * Recursively sort object keys, matching the reference `sortObject` helper in
 * the NOWPayments IPN docs. Arrays keep their order (only their object members
 * are sorted) so the serialization still matches PHP's json_encode of a list.
 */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep(source[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Sort only the top level, matching PHP's non-recursive `ksort`. */
function sortShallow(value: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = value[key];
      return acc;
    }, {});
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the `x-nowpayments-sig` IPN signature.
 *
 * NOWPayments signs HMAC-SHA512 over the key-sorted JSON body. Their own
 * examples differ on whether the sort is recursive (Node `sortObject`) or top
 * level only (PHP `ksort`), and the payloads are flat in practice so both agree.
 * We accept either serialization: each candidate is still an HMAC under the IPN
 * secret, so allowing both costs nothing in security but avoids rejecting every
 * legitimate webhook if a nested field ever appears.
 */
export function verifyNOWPaymentsIPN(payload: unknown, signature: string): boolean {
  try {
    if (!NOWPAYMENTS_IPN_SECRET) {
      console.error("NOWPAYMENTS_IPN_SECRET not configured - rejecting webhook");
      return false;
    }
    if (!signature || !payload || typeof payload !== "object") {
      return false;
    }

    const candidates = [
      JSON.stringify(sortDeep(payload)),
      JSON.stringify(sortShallow(payload as Record<string, unknown>)),
    ];

    const received = signature.trim().toLowerCase();

    for (const candidate of candidates) {
      const expected = crypto
        .createHmac("sha512", NOWPAYMENTS_IPN_SECRET)
        .update(candidate)
        .digest("hex");
      if (timingSafeEqualHex(received, expected)) return true;
    }

    return false;
  } catch (error) {
    console.error("IPN verification error:", error);
    return false;
  }
}

/**
 * Get available currencies from NOWPayments
 */
export async function getNOWPaymentCurrencies(): Promise<{
  success: boolean;
  currencies?: string[];
  error?: string;
}> {
  try {
    if (!NOWPAYMENTS_API_KEY) {
      return { success: false, error: "NOWPayments API key not configured" };
    }

    const response = await fetch(`${NOWPAYMENTS_API_URL}/currencies`, {
      method: "GET",
      headers: { "x-api-key": NOWPAYMENTS_API_KEY },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: data?.message || "Failed to get currencies" };
    }

    return { success: true, currencies: data.currencies || [] };
  } catch (error) {
    console.error("NOWPayments currencies error:", error);
    return { success: false, error: "Failed to fetch currencies" };
  }
}

/**
 * Smallest amount NOWPayments will accept for a given coin, expressed in the
 * fiat currency we price in. Checkout uses this to fail early with a clear
 * message instead of letting the invoice call blow up.
 */
export async function getNOWPaymentMinAmount(
  currencyFrom: string,
  currencyTo = "usd"
): Promise<{ success: boolean; minAmount?: number; error?: string }> {
  try {
    if (!NOWPAYMENTS_API_KEY) {
      return { success: false, error: "NOWPayments API key not configured" };
    }

    const response = await fetch(
      `${NOWPAYMENTS_API_URL}/min-amount?currency_from=${encodeURIComponent(
        currencyFrom
      )}&currency_to=${encodeURIComponent(currencyTo)}`,
      {
        method: "GET",
        headers: { "x-api-key": NOWPAYMENTS_API_KEY },
        cache: "no-store",
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: data?.message || "Failed to get minimum amount" };
    }

    const parsed = Number(data.min_amount);
    return {
      success: true,
      minAmount: Number.isFinite(parsed) ? parsed : undefined,
    };
  } catch (error) {
    console.error("NOWPayments min amount error:", error);
    return { success: false, error: "Failed to fetch minimum amount" };
  }
}

/**
 * Map internal currency codes to NOWPayments currency codes
 */
export function mapToNOWPaymentsCurrency(internalCode: string): string {
  const mapping: Record<string, string> = {
    BTC: "btc",
    ETH: "eth",
    USDT_ERC20: "usdterc20",
    USDT_TRC20: "usdttrc20",
    USDC: "usdc",
    LTC: "ltc",
    XMR: "xmr",
    DOGE: "doge",
    BNB: "bnbbsc",
    SOL: "sol",
    TRX: "trx",
  };

  return mapping[internalCode] || internalCode.toLowerCase();
}

/**
 * Payment statuses NOWPayments reports, grouped by what they mean for us.
 * `finished` is the only terminal success; `confirmed` means the chain has the
 * funds and NOWPayments is settling, which is safe to fulfil on.
 */
export const NOWPAYMENTS_SUCCESS_STATUSES = ["confirmed", "finished"] as const;
export const NOWPAYMENTS_FAILURE_STATUSES = ["failed", "refunded", "expired"] as const;
export const NOWPAYMENTS_PENDING_STATUSES = [
  "waiting",
  "confirming",
  "sending",
] as const;

/**
 * Check if NOWPayments is configured
 */
export function isNOWPaymentsConfigured(): boolean {
  return !!(NOWPAYMENTS_API_KEY && NOWPAYMENTS_IPN_SECRET);
}
