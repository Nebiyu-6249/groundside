import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // No dev-mode badge: screenshots and recordings are taken from the dev server too.
  devIndicators: false,
  partialPrefetching: true,
  // pg and the Prisma adapter run on the Node.js server only.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  // Security headers (SPEC 13). A full script-src policy would need per-request nonces for the
  // framework's inline scripts and the PayPal SDK; these headers block framing, sniffing and
  // plugin content without that.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
