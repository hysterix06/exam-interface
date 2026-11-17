import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// Phone numbers are parsed and formatted in one place (src/lib/phone.ts), so every
// render site shows the same notation. Anything else imports from "@/lib/phone".
const phoneOnlyInLib = {
  group: ["libphonenumber-js", "libphonenumber-js/*"],
  message: 'Import phone helpers from "@/lib/phone"; only that file may use libphonenumber-js.',
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The full recommended accessibility set; next/core-web-vitals turns on only a few.
  // The plugin itself is already registered by eslint-config-next.
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Our Input/Select/Textarea render real controls; let labels wrapping them count.
      "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["Input", "Select", "Textarea"], depth: 3 }],
      // `role` on our own components (e.g. <AddMembers role="teacher">) is a prop, not ARIA.
      "jsx-a11y/aria-role": ["error", { ignoreNonDOM: true }],
      // Only DOM autoFocus is banned. Components may take it for a focus the person
      // asked for (e.g. arriving from "New exam").
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
    },
  },
  {
    rules: {
      // `const { key: _key, ...rest } = x` is how cores redact fields.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
    ignores: ["src/lib/phone.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [phoneOnlyInLib] }] },
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
            phoneOnlyInLib,
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
