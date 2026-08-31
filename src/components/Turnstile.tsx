"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

/**
 * Cloudflare Turnstile widget.
 *
 * The browser half of the check. It hands back a single-use token which the
 * form must send to its API route, where verifyTurnstile (src/lib/turnstile.ts)
 * redeems it. The token alone proves nothing until that happens.
 *
 * Most visitors never interact with this: Turnstile usually settles on its own
 * from browser signals and shows a short "verifying" state, which is why it
 * replaced the arithmetic question that used to sit here.
 */

/**
 * The public site key.
 *
 * Written out in full rather than read from a variable because Next inlines
 * NEXT_PUBLIC_* by literal text substitution at build time — `process.env[name]`
 * or a destructured copy is NOT replaced and arrives as undefined in the
 * browser.
 *
 * Being a build-time value, it also means: set this in the VPS environment
 * BEFORE running `next build`. Editing it afterwards and restarting does
 * nothing, because the old value is already baked into the bundle. The secret
 * key is the opposite — runtime only, so a restart is enough for that one.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

/**
 * Whether the widget can render at all.
 *
 * Forms read this to decide whether to require a token before submitting. With
 * no site key the widget is absent, so demanding a token would make the form
 * permanently unsubmittable — the server side fails open for the same reason.
 */
export const TURNSTILE_ENABLED = SITE_KEY.length > 0;

/** The subset of the Turnstile JS API this component uses. */
interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
      appearance?: "always" | "execute" | "interaction-only";
    }
  ) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileProps {
  /**
   * Called with the token when the challenge is solved, and with "" whenever
   * it is lost — expired, errored, or reset. A form should treat "" as "not
   * verified" rather than keeping the last good token around.
   */
  onToken: (token: string) => void;
  /**
   * Change this number to force a fresh challenge. Tokens are single-use, so
   * after any rejected submit the widget MUST be reset or the next attempt
   * fails with "timeout-or-duplicate" no matter what the customer types.
   */
  resetKey?: number;
}

export default function Turnstile({ onToken, resetKey = 0 }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  // Held in a ref so the render effect below does not re-run — and tear the
  // widget down mid-challenge — every time the parent re-renders and passes a
  // freshly created callback.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const markReady = useCallback(() => setReady(true), []);

  // The script may already be present: next/script keeps one copy across client
  // navigations, so arriving at /auth/login from /auth/register can mean onLoad
  // has already fired and will not fire again.
  useEffect(() => {
    if (window.turnstile) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !TURNSTILE_ENABLED) return;
    const api = window.turnstile;
    const container = containerRef.current;
    if (!api || !container || widgetIdRef.current) return;

    // Match the site's own toggle (ThemeToggle writes data-theme on <html>)
    // rather than using "auto", which follows the OS setting and would leave a
    // white widget in the middle of a dark card for anyone whose OS disagrees.
    const siteTheme = document.documentElement.dataset.theme;
    const theme = siteTheme === "day" ? "light" : "dark";

    const id = api.render(container, {
      sitekey: SITE_KEY,
      theme,
      callback: (token: string) => onTokenRef.current(token),
      // Both failure paths clear the token. Turnstile tokens expire after a
      // few minutes, and a form left open on a phone will routinely outlive
      // one; clearing it means the customer is asked to re-verify instead of
      // submitting something the server will only reject.
      "error-callback": () => onTokenRef.current(""),
      "expired-callback": () => onTokenRef.current(""),
    });

    if (id) widgetIdRef.current = id;

    return () => {
      // Without this, React strict mode's double-mount in development leaves an
      // orphaned widget behind and two challenges stack up in the card.
      if (widgetIdRef.current) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // Already gone — nothing to clean up.
        }
        widgetIdRef.current = null;
      }
    };
  }, [ready]);

  // Deliberately skips the first run: resetKey starts at 0 and a reset before
  // the widget exists is a no-op at best.
  useEffect(() => {
    if (resetKey === 0) return;
    if (!widgetIdRef.current || !window.turnstile) return;
    try {
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current("");
    } catch {
      // A widget that cannot be reset is one the customer can still reload.
    }
  }, [resetKey]);

  if (!TURNSTILE_ENABLED) return null;

  return (
    <>
      {/* render=explicit: without it Turnstile scans the DOM for .cf-turnstile
          on load, which races React and finds nothing on a client-side
          navigation. Rendering by hand above is deterministic.

          The Content-Security-Policy in next.config.ts must allow
          challenges.cloudflare.com in script-src AND frame-src. The widget is
          plain DOM in the ordinary case, but an interactive challenge is an
          iframe — so a missing frame-src fails only for the visitors who get
          challenged, silently, with nothing but a console entry. */}
      <Script
        id="cf-turnstile-script"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={markReady}
        onReady={markReady}
      />
      <div ref={containerRef} />
    </>
  );
}
