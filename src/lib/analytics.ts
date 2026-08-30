"use client";

/**
 * Ad-platform conversion tracking.
 *
 * Google Ads and X Ads are deliberately kept apart, and nothing here is shared
 * between them. Each has its own base tag, its own global (`window.gtag` vs
 * `window.twq`), its own cookies and its own servers, and each call below sits
 * in its own try/catch.
 *
 * That isolation is the point: one platform being blocked - by an ad blocker,
 * by a CSP mistake, or by a script that simply failed to load - must never stop
 * the other from recording its own conversion. Neither platform ever sees the
 * other's numbers, so each reports only the sign-ups it can attribute itself.
 */

/** X (Twitter) sign-up event, from the X Ads events manager. */
const X_SIGNUP_EVENT_ID = "tw-remr0-reo55";

/** One Google Ads conversion action, as its own event snippet describes it. */
interface GoogleConversion {
  /** The "send_to" value: "AW-<account>/<label>". */
  sendTo: string;
  /** Optional conversion value. Omit for a plain count. */
  value?: number;
  /** ISO code, required whenever `value` is set. Must match the currency the
   *  conversion action was created with, or Google converts it behind your back. */
  currency?: string;
}

/**
 * Google Ads sign-up conversions, fired when an account is genuinely created.
 *
 * ONE ENTRY PER ACTUAL CONVERSION, NOT ONE PER SNIPPET GOOGLE GAVE YOU.
 * Google Ads hands out a separate snippet for every conversion action, and the
 * setup wizard readily creates the same one twice - the giveaway is a name like
 * "Sign-up (1)". Both snippets fire correctly, so nothing looks broken; the
 * damage is silent. Every sign-up is then counted twice, the conversion figures
 * read double, cost-per-conversion reads half, and any Smart Bidding strategy
 * fed by that action optimises against a number that is not real.
 *
 * The account currently holds two sign-up actions:
 *
 *   BxOYCKiFp-ccEIvw94RE   "Sign-up"      - plain count, no value
 *   3byJCN33muocEIvw94RE   "Sign-up (1)"  - value 1.0 INR   <- the one in use
 *
 * The value-bearing one is used because it is a superset: it counts the same
 * sign-up and additionally carries a value, so value-based bidding stays
 * available. The nominal 1.0 is Google's own placeholder - a sign-up has no
 * revenue yet - and INR matches the account's billing currency.
 *
 * Add the other only if you have deliberately marked one action "Secondary" in
 * Google Ads, which keeps it out of the headline figures and out of bidding.
 * Otherwise leave this at one entry.
 *
 * An empty array disables the Google half entirely and leaves X recording
 * normally - the whole reason the two platforms are kept apart.
 */
const GOOGLE_SIGNUP_CONVERSIONS: GoogleConversion[] = [
  { sendTo: "AW-18263963659/3byJCN33muocEIvw94RE", value: 1.0, currency: "INR" },
];

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    twq?: (...args: unknown[]) => void;
  }
}

/**
 * Record a completed sign-up on every ad platform that is configured.
 *
 * Call this only once the account genuinely exists - never on form submit, or
 * the campaign data counts attempts instead of customers, and never on the
 * dashboard, or it counts every later visit as a new sign-up.
 *
 * Never throws: a tracking failure must not stop a real customer reaching
 * their dashboard.
 */
export function trackSignUp(): void {
  if (typeof window === "undefined") return;

  // --- X Ads ---------------------------------------------------------------
  // `conversion_id` is X's deduplication key. A sign-up has no order id to key
  // on, and X's own snippet ships it as null, so it stays null here.
  try {
    window.twq?.("event", X_SIGNUP_EVENT_ID, { conversion_id: null });
  } catch (err) {
    console.error("X Ads sign-up event failed:", err);
  }

  // --- Google Ads ----------------------------------------------------------
  // Each conversion is sent in its own try/catch for the same reason the two
  // platforms are: one action failing must not stop the next from recording.
  for (const conversion of GOOGLE_SIGNUP_CONVERSIONS) {
    try {
      // `value` and `currency` are omitted entirely rather than sent as
      // undefined when the action carries no value. gtag treats a present-but-
      // undefined value as a zero-value conversion, which is a different thing
      // from a conversion that was never given a value at all.
      const payload: Record<string, unknown> = { send_to: conversion.sendTo };
      if (conversion.value !== undefined) {
        payload.value = conversion.value;
        payload.currency = conversion.currency;
      }

      window.gtag?.("event", "conversion", payload);
    } catch (err) {
      console.error(`Google Ads conversion ${conversion.sendTo} failed:`, err);
    }
  }
}
