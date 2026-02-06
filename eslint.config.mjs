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
    // Cloudflare build output:
    ".open-next/**",
    // Debug scripts:
    "scripts/debug/**",
  ]),
  // Custom rules
  {
    rules: {
      // Allow apostrophes and quotes in JSX - they're handled fine in modern React
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
