import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scratch build dir used by `npm run verify`.
    ".next-verify/**",
    // Edge Functions run on Deno, not on Next's Node/browser runtimes: they
    // use `Deno.*` globals and URL imports, and carry their own
    // `deno-lint-ignore` directives which ESLint does not understand. They are
    // checked by `deno lint` / `supabase functions deploy` instead, and are
    // excluded from tsconfig.json for the same reason.
    "supabase/functions/**",
  ]),

  {
    rules: {
      // A leading underscore is our marker for a parameter that exists only to
      // satisfy a signature — e.g. `signOut(_formData?: FormData)`, which takes
      // the argument React passes to a `<form action>` and ignores it.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
