import path from "node:path";
import type { NextConfig } from "next";

// cacheComponents/partialPrefetching are intentionally off: nearly every route
// depends on the signed-in user, and plain dynamic rendering keeps exam state
// easy to reason about.
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Assignment hand-ins (10 MB a file, src/engine/assignments/settings.ts) plus multipart overhead.
      bodySizeLimit: "11mb",
    },
  },
  // Pages may only be framed by this app (widgets are embedded same-origin).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  turbopack: {
    // A stray lockfile in ~ makes Next infer the wrong workspace root.
    root: path.resolve(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
