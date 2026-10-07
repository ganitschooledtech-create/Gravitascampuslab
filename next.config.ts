import type { NextConfig } from "next";

// Security headers applied to every response. CSP is set in proxy.ts (it needs a per-request nonce later).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // "standalone" produces a self-contained server bundle, so the same build runs on
  // Vercel, a Docker container, AWS ECS/App Runner, or any Node host.
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["@node-rs/argon2", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
