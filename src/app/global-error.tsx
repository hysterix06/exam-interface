"use client";

import "./globals.css";
import { type ErrorProps, errorDigest } from "@/components/shell/error-state";

// Replaces the root layout when the layout itself throws, so it brings its own
// <html>, <body> and styles, and applies the saved theme the way the layout does.
export default function GlobalError({ error, retry }: ErrorProps) {
  const digest = errorDigest(error);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong · Modus</title>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Your work is saved on the server. Try again, and if it keeps happening, tell your instructor
            {digest ? ` and quote reference ${digest}` : ""}.
          </p>
          <div>
            <button
              type="button"
              onClick={() => retry()}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
