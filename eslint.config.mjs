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
    // Local tunnel helpers (not app source)
    "tmp-tun*.js",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "prefer-const": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    }
  },
  // Client UI trees must not pull Node/server packages into the browser graph.
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/context/**/*.{ts,tsx}",
      "src/hooks/**/*.{ts,tsx}",
      "src/app/**/*.tsx",
    ],
    ignores: ["src/app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message: "Do not import Prisma into client UI. Use API routes / server components.",
            },
            {
              name: "pdfkit",
              message: "pdfkit is server-only.",
            },
            {
              name: "bullmq",
              message: "bullmq is server-only.",
            },
            {
              name: "ioredis",
              message: "ioredis is server-only.",
            },
            {
              name: "fs",
              message: "Node fs is server-only.",
            },
            {
              name: "node:fs",
              message: "Node fs is server-only.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
