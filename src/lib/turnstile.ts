/**
 * Cloudflare Turnstile — server-side verification.
 *
 * Turnstile is a two-part check and BOTH halves are required. The widget in
 * the browser (src/components/Turnstile.tsx) produces a single-use token; this
 * file is what redeems that token against Cloudflare. A token that is never
 * verified server-side proves nothing at all — anyone can POST the login route
 * directly with a made-up string — so every route that renders the widget must
 * call `verifyTurnstile` before it does any work.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** How long to wait on Cloudflare before giving up, in ms. */
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * Whether Turnstile is switched on for this server.
 *
 * The secret key is the switch, not the site key: the site key is public and
 * frozen into the browser bundle at build time, while this one is read at
 * runtime. With no secret there is nothing to verify a token against, so the
 * check is skipped rather than failed.
 *
 * That direction is deliberate. Failing closed would mean that deploying this
 * code before the keys are added to the VPS locks every single customer out of
 * their account, including the admins who would have to fix it. Failing open
 * leaves the site exactly as protected as it was the day before — the rate
 * limiter in src/proxy.ts and the account lockout in the login route are both
 * still doing their jobs — and the warning below says so out loud.
 */
export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/** Logged once per process rather than once per login, which would be noise. */
let warnedUnconfigured = false;

/** Cloudflare's siteverify response, narrowed to the fields worth reading. */
interface SiteVerifyResponse {
  success: boolean;
  /** e.g. "invalid-input-response", "timeout-or-duplicate". */
  "error-codes"?: string[];
  /** The hostname the widget was solved on. */
  hostname?: string;
  challenge_ts?: string;
}

export interface TurnstileResult {
  success: boolean;
  /** A message safe to show a customer. Empty when `success` is true. */
  error: string;
  /** Cloudflare's raw error codes, for the server log only — never the body. */
  codes: string[];
}

/**
 * Redeem one Turnstile token.
 *
 * `token` is whatever the browser sent; treat it as hostile input. `remoteIp`
 * should be the caller's real address (see getClientIp in lib/rate-limit) —
 * Cloudflare uses it as a signal, and passing the wrong one, such as the
 * proxy's own address, makes every visitor look like they share a machine.
 *
 * Never throws. A network failure reaching Cloudflare is reported as a failure
 * the customer can retry, not as a 500.
 */
export async function verifyTurnstile(
  token: unknown,
  remoteIp?: string
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "TURNSTILE_SECRET_KEY is not set — bot verification is DISABLED. " +
          "Set it (Cloudflare dashboard -> Turnstile -> your widget) and restart."
      );
    }
    return { success: true, error: "", codes: [] };
  }

  if (typeof token !== "string" || token.length === 0) {
    return {
      success: false,
      error: "Please complete the security check.",
      codes: ["missing-input-response"],
    };
  }

  // Cloudflare caps the token length; anything longer is not a token we issued
  // and is rejected here rather than spending a round trip on it.
  if (token.length > 2048) {
    return {
      success: false,
      error: "Security check failed. Please try again.",
      codes: ["invalid-input-response"],
    };
  }

  // application/x-www-form-urlencoded, not JSON. siteverify accepts either,
  // but the form encoding is what every Cloudflare example uses and it avoids
  // any question of how the token's characters are escaped.
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      // This is a live check of a single-use token. A cached answer would let
      // one solved challenge be replayed, which is the whole thing Turnstile
      // exists to prevent.
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`Turnstile siteverify returned HTTP ${res.status}`);
      return {
        success: false,
        error: "Could not complete the security check. Please try again.",
        codes: [`http-${res.status}`],
      };
    }

    const data = (await res.json()) as SiteVerifyResponse;
    const codes = data["error-codes"] ?? [];

    if (data.success) return { success: true, error: "", codes: [] };

    // The codes are logged but never returned to the browser: they distinguish
    // "your secret key is wrong" from "this token was already used", and only
    // the first of those is any of an attacker's business.
    console.error("Turnstile verification failed:", codes.join(", ") || "no code");

    // "timeout-or-duplicate" means a real person solved it and then the token
    // expired or was submitted twice — worth its own message, because telling
    // them the check "failed" invites them to retype a password that was fine.
    const expired = codes.includes("timeout-or-duplicate");
    return {
      success: false,
      error: expired
        ? "Security check expired. Please try again."
        : "Security check failed. Please try again.",
      codes,
    };
  } catch (err) {
    // Includes the AbortSignal timeout above.
    console.error("Turnstile verification error:", err);
    return {
      success: false,
      error: "Could not reach the security check. Please try again.",
      codes: ["network-error"],
    };
  }
}
