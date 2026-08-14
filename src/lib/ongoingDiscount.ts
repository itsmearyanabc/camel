// Relative import on purpose: this module is shared with the Telegram bot,
// which runs under tsx and does not resolve the "@/" path alias.
import { prisma } from "./db";

/** Setting keys backing the always-on store-wide discount. */
export const ONGOING_DISCOUNT_ENABLED_KEY = "ONGOING_DISCOUNT_ENABLED";
export const ONGOING_DISCOUNT_PERCENT_KEY = "ONGOING_DISCOUNT_PERCENT";

export interface OngoingDiscount {
  enabled: boolean;
  /** Whole or fractional percent, 0-100. Zero whenever it is switched off. */
  percent: number;
}

const OFF: OngoingDiscount = { enabled: false, percent: 0 };

/**
 * The store-wide discount an admin has switched on, if any.
 *
 * This is deliberately not a Coupon row: it applies to every customer with no
 * code to type, has no usage limits to track and no per-user history, so
 * modelling it as a coupon would mean inventing a phantom CouponUsage for every
 * order just to reuse machinery none of which applies.
 *
 * Never throws - a settings read that fails must not take checkout down with
 * it, so the discount simply reads as off.
 */
export async function getOngoingDiscount(): Promise<OngoingDiscount> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: [ONGOING_DISCOUNT_ENABLED_KEY, ONGOING_DISCOUNT_PERCENT_KEY] } },
    });
    return parseOngoingDiscount(
      rows.reduce<Record<string, string>>((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {})
    );
  } catch (err) {
    console.error("getOngoingDiscount error:", err);
    return OFF;
  }
}

/** Same read, but from a settings map the caller already has in hand. */
export function parseOngoingDiscount(settings: Record<string, string | undefined>): OngoingDiscount {
  const enabled = settings[ONGOING_DISCOUNT_ENABLED_KEY] === "true";
  if (!enabled) return OFF;

  const percent = Number(settings[ONGOING_DISCOUNT_PERCENT_KEY]);
  // A malformed or out-of-range percent is treated as off rather than clamped
  // to 100 - giving the whole shop away on a typo is not a recoverable mistake.
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return OFF;

  return { enabled: true, percent };
}

/**
 * Money off `amount` for a given discount, rounded to cents.
 *
 * Returns 0 when the discount is off, so callers can apply it unconditionally.
 */
export function ongoingDiscountAmount(amount: number, discount: OngoingDiscount): number {
  if (!discount.enabled || discount.percent <= 0) return 0;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const off = (amount * discount.percent) / 100;
  // Never hand back more than the order is worth.
  return Math.min(parseFloat(off.toFixed(2)), parseFloat(amount.toFixed(2)));
}
