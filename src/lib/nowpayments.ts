import crypto from "crypto";

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || "";
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "";
const NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1";

export interface NOWPaymentInvoice {
  id: string;
  order_id: string;
  order_description: string;
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  ipn_callback_url: string;
  invoice_url: string;
  success_url: string;
  cancel_url: string;
  created_at: string;
  updated_at: string;
}

export interface NOWPaymentStatus {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
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
 * Create a payment invoice with NOWPayments
 */
export async function createNOWPaymentInvoice(params: {
  priceAmount: number;
  priceCurrency: string;
  payCurrency: string;
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

    const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NOWPAYMENTS_API_KEY,
      },
      body: JSON.stringify({
        price_amount: params.priceAmount,
        price_currency: params.priceCurrency,
        pay_currency: params.payCurrency,
        order_id: params.orderId,
        order_description: params.orderDescription,
        ipn_callback_url: params.ipnCallbackUrl,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("NOWPayments API error:", data);
      return { success: false, error: data.message || "Failed to create invoice" };
    }

    return { success: true, invoice: data };
  } catch (error) {
    console.error("NOWPayments invoice creation error:", error);
    return { success: false, error: "Failed to create payment invoice" };
  }
}

/**
 * Get payment status from NOWPayments
 */
export async function getNOWPaymentStatus(paymentId: string): Promise<{
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
      headers: {
        "x-api-key": NOWPAYMENTS_API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("NOWPayments status check error:", data);
      return { success: false, error: data.message || "Failed to get payment status" };
    }

    return { success: true, status: data };
  } catch (error) {
    console.error("NOWPayments status check error:", error);
    return { success: false, error: "Failed to check payment status" };
  }
}

/**
 * Verify NOWPayments IPN webhook signature
 */
export function verifyNOWPaymentsIPN(payload: any, signature: string): boolean {
  try {
    if (!NOWPAYMENTS_IPN_SECRET) {
      console.error("NOWPAYMENTS_IPN_SECRET not configured");
      return false;
    }

    // Sort the payload keys
    const sortedPayload = Object.keys(payload)
      .sort()
      .reduce((acc: any, key) => {
        acc[key] = payload[key];
        return acc;
      }, {});

    // Create the string to sign
    const stringToSign = JSON.stringify(sortedPayload);

    // Generate HMAC signature
    const hmac = crypto.createHmac("sha512", NOWPAYMENTS_IPN_SECRET);
    hmac.update(stringToSign);
    const expectedSignature = hmac.digest("hex");

    return signature === expectedSignature;
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
      headers: {
        "x-api-key": NOWPAYMENTS_API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || "Failed to get currencies" };
    }

    return { success: true, currencies: data.currencies || [] };
  } catch (error) {
    console.error("NOWPayments currencies error:", error);
    return { success: false, error: "Failed to fetch currencies" };
  }
}

/**
 * Get minimum payment amount for a currency
 */
export async function getNOWPaymentMinAmount(currency: string): Promise<{
  success: boolean;
  minAmount?: number;
  error?: string;
}> {
  try {
    if (!NOWPAYMENTS_API_KEY) {
      return { success: false, error: "NOWPayments API key not configured" };
    }

    const response = await fetch(`${NOWPAYMENTS_API_URL}/min-amount?currency_from=${currency}&currency_to=usd`, {
      method: "GET",
      headers: {
        "x-api-key": NOWPAYMENTS_API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || "Failed to get minimum amount" };
    }

    return { success: true, minAmount: data.min_amount };
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
    SOL: "sol",
    TRX: "trx",
  };

  return mapping[internalCode] || internalCode.toLowerCase();
}

/**
 * Check if NOWPayments is configured
 */
export function isNOWPaymentsConfigured(): boolean {
  return !!(NOWPAYMENTS_API_KEY && NOWPAYMENTS_IPN_SECRET);
}
