import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camel971 — Private Marketplace",
  description: "Browse, order, and track deliveries with Camel971.",
  // Tab and home-screen icons come from src/app/icon.png and
  // src/app/apple-icon.png; Next.js gives those files priority over any
  // `icons` listed here, so none are.
};

import { LanguageProvider } from "@/components/LanguageContext";

/**
 * Google Ads conversion tag.
 *
 * The id is a public identifier - it ships to every browser that loads the
 * site - so it lives here rather than in the environment.
 *
 * Only fired in production. A dev machine running `next dev` would
 * otherwise report test purchases as real conversions and quietly poison
 * the campaign data this is being installed to measure.
 */
const GOOGLE_ADS_ID = "AW-18263963659";

/**
 * X (Twitter) Ads base pixel id.
 *
 * Derived from the event id X issued for the sign-up event, "tw-remr0-reo55":
 * X formats those as tw-{pixelId}-{eventId}. The event id itself lives in
 * src/lib/analytics.ts.
 */
const X_PIXEL_ID = "remr0";
const ADS_ENABLED = process.env.NODE_ENV === "production";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          {children}
        </LanguageProvider>

        {/* Google Ads (gtag.js).

            `afterInteractive` rather than `beforeInteractive`: the tag only
            has to fire once the page is up, and blocking first paint on a
            third-party script costs real conversions on a slow connection.
            Next still injects it on every route, and only once across client
            side navigations.

            The Content-Security-Policy in next.config.ts must allow
            googletagmanager.com or this is blocked before it runs. */}
        {ADS_ENABLED && (
          <>
            <Script
              id="google-ads-gtag-src"
              src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-ads-gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GOOGLE_ADS_ID}');
              `}
            </Script>
          </>
        )}

        {/* X (Twitter) Ads pixel.

            Kept entirely separate from the Google tag above - its own loader,
            its own global (window.twq), its own cookies and its own servers.
            Neither platform can see or affect the other's numbers, and one
            failing to load leaves the other recording normally.

            Sitewide for the same reason as Google: the pixel has to be present
            on the page an ad click lands on, not only the page that converts,
            or the click can never be attributed to the sign-up.

            The Content-Security-Policy in next.config.ts must allow
            static.ads-twitter.com or this is blocked before it runs. */}
        {ADS_ENABLED && (
          <Script id="x-ads-pixel" strategy="afterInteractive">
            {`
              !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
              twq('config','${X_PIXEL_ID}');
            `}
          </Script>
        )}
      </body>
    </html>
  );
}
