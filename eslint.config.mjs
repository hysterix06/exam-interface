import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { key: _key, ...rest } = x` is how cores redact fields.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  // The engine and question-type cores must stay pure so they run in the
  // browser preview, on the server and in tests alike.
  {
    files: ["src/engine/**/*.ts", "src/question-types/*/core.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*"], message: "Engine code must not import React." },
            { group: ["next", "next/*"], message: "Engine code must not import Next.js." },
            { group: ["@/db", "@/db/*", "@/server/*", "@/lib/supabase/*"], message: "Engine code must not touch the database." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
]);

export default eslintConfig;
