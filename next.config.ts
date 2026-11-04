import path from "node:path";
import type { NextConfig } from "next";

// cacheComponents/partialPrefetching are intentionally off: nearly every route
// depends on the signed-in user, and plain dynamic rendering keeps exam state
// easy to reason about. Revisit in Phase 7 for public/static pages.
const nextConfig: NextConfig = {
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
  // The old single staff area was split into /teach (instructors) and /admin
  // (operators). Old links and bookmarks keep working.
  async redirects() {
    const r = (source: string, destination: string) => ({ source, destination, permanent: false });
    return [
      r("/author", "/teach"),
      r("/author/topics", "/teach/courses"),
      r("/author/questions/:path*", "/teach/questions/:path*"),
      r("/author/exams", "/teach/exams"),
      r("/author/exams/:id", "/teach/exams/:id"),
      r("/admin/exams", "/teach/exams"),
      r("/admin/exams/:id", "/teach/exams/:id/run"),
      r("/admin/exams/:id/live", "/teach/exams/:id/run"),
      r("/admin/exams/:id/analysis", "/teach/exams/:id/results/analysis"),
      r("/admin/exams/:id/regrade", "/teach/exams/:id/results/regrade"),
      r("/admin/exams/:id/attempts/:attemptId", "/teach/exams/:id/results/:attemptId"),
      r("/admin/exams/:id/export", "/teach/exams/:id/export"),
      r("/admin/review", "/teach/marking"),
      r("/admin/review/:examId", "/teach/marking/:examId"),
      r("/admin/audit", "/admin/activity"),
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
