import path from "node:path";
import type { NextConfig } from "next";

// cacheComponents/partialPrefetching are intentionally off: nearly every route
// depends on the signed-in user, and plain dynamic rendering keeps exam state
// easy to reason about. Revisit in Phase 7 for public/static pages.
const nextConfig: NextConfig = {
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
