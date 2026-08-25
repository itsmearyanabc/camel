import type { NextConfig } from "next";
import path from "path";

/**
 * Content-Security-Policy, assembled from a list so each directive stays
 * readable and adding a third party is one line rather than editing a
 * 600-character string.
 *
 * The Google Ads entries are load-bearing: gtag.js is fetched from
 * googletagmanager.com and reports conversions to googleadservices and
 * doubleclick. Without them the browser blocks the tag before it runs and
 * not a single conversion is ever recorded - silently, because a CSP
 * violation only shows in the console.
 */
const CSP = [
  "default-src 'self'",

  // 'unsafe-inline' is what lets the gtag bootstrap snippet in
  // src/app/layout.tsx execute. It was already required by the app.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
    "https://www.googletagmanager.com https://www.googleadservices.com " +
    "https://googleads.g.doubleclick.net https://www.google-analytics.com " +
    // X (Twitter) Ads loads its pixel from here. Listed separately from the
    // Google entries so removing one platform never disturbs the other.
    "https://static.ads-twitter.com",

  // globals.css imports DM Sans / Space Grotesk from Google Fonts. This was
  // missing, so the browser blocked the stylesheet and the whole site quietly
  // fell back to system fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  // ...and the font files themselves come from gstatic.
  "font-src 'self' data: https://fonts.gstatic.com",

  // Where the tag actually reports back to. Conversion pixels travel as
  // images (already allowed by img-src https:), but the beacon/fetch calls
  // need to be listed here or they fail.
  "connect-src 'self' https://api.telegram.org " +
    "https://www.googletagmanager.com https://www.google-analytics.com " +
    "https://analytics.google.com https://stats.g.doubleclick.net " +
    "https://googleads.g.doubleclick.net https://www.googleadservices.com " +
    "https://www.google.com https://ad.doubleclick.net " +
    // Where the X pixel reports its conversions.
    "https://analytics.twitter.com https://t.co",

  // Google Ads drops a conversion iframe; without this it inherits
  // default-src 'self' and is blocked.
  "frame-src 'self' https://td.doubleclick.net https://www.googletagmanager.com",
].join("; ");

const nextConfig: NextConfig = {
  // Pin the project root.
  //
  // Next infers it by walking up for a lockfile, and the VPS has a stray
  // /root/package-lock.json sitting above the app - so it picked /root and
  // warned on every build AND on every boot. Pinning both keys makes the root
  // deterministic regardless of what else exists above the deployment
  // directory: `turbopack.root` is what the build reads, `outputFileTracingRoot`
  // is what the production server reads.
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: __dirname,

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },

  // Disable powered-by header
  poweredByHeader: false,
};

export default nextConfig;
