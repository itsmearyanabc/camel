import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camel971 — Private Marketplace",
  description: "Browse, order, and track deliveries with Camel971.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
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
      </body>
    </html>
  );
}
