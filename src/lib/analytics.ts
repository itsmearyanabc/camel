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

/**
 * Google Ads sign-up conversion label, e.g. "AW-18263963659/AbC-D_efGhIj".
 *
 * Empty until the conversion action is created in Google Ads. While it is
 * blank the Google half simply does not fire, which leaves X recording
 * normally - the whole reason the two are separated.
 */
const GOOGLE_SIGNUP_CONVERSION_LABEL = "";

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
  try {
    if (GOOGLE_SIGNUP_CONVERSION_LABEL) {
      window.gtag?.("event", "conversion", {
        send_to: GOOGLE_SIGNUP_CONVERSION_LABEL,
      });
    }
  } catch (err) {
    console.error("Google Ads sign-up conversion failed:", err);
  }
}
