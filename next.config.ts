import type { NextConfig } from "next";
import path from "path";

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
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.telegram.org;" },
        ],
      },
    ];
  },

  // Disable powered-by header
  poweredByHeader: false,
};

export default nextConfig;
