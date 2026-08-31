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
      "src/lib/clearImpersonation.ts",
      "src/lib/dalClient.ts",
      "src/lib/authTabSync.ts",
      "src/lib/userScopedStorage.ts",
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
              name: "@/lib/prisma",
              message: "Do not import Prisma into client UI. Use API routes / server components.",
            },
            {
              name: "@/lib/resolveBuyerScope",
              message: "resolveBuyerScope is server-only. Use it from API routes, not client modules.",
            },
            {
              name: "@/middleware/auth",
              message: "Auth middleware is server-only. Use API routes / server components.",
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
              name: "pg",
              message: "pg is server-only. Use API routes / server components.",
            },
            {
              name: "dns",
              message: "Node dns is server-only.",
            },
            {
              name: "net",
              message: "Node net is server-only.",
            },
            {
              name: "tls",
              message: "Node tls is server-only.",
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
  {
    files: [
      "src/app/api/v1/cart/**/*.ts",
      "src/app/api/v1/checkout/**/*.ts",
      "src/app/api/v1/orders/**/*.ts",
      "src/app/api/v1/addresses/**/*.ts",
      "src/app/api/v1/wallet/**/*.ts",
      "src/app/api/v1/credit/**/*.ts",
      "src/app/api/v1/lists/**/*.ts",
      "src/app/api/v1/promotions/**/*.ts",
      "src/app/api/v1/payments/**/*.ts",
      "src/app/api/v1/notifications/**/*.ts",
      "src/app/api/v1/vendors/**/*.ts",
      "src/app/api/v1/push/**/*.ts",
      "src/app/api/v1/me/**/*.ts",
    ],
    ignores: [
      "src/app/api/v1/wallet/reactivate/**",
      "src/app/api/v1/orders/**/status/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='ctx'][property.name='userId']",
          message: "Use effectiveCustomerUserId(ctx) for storefront identity. Disable this rule only when the real admin userId is required (rate limits, audit, self-delete).",
        },
        {
          selector: "MemberExpression[object.name='ctx'][property.name='activeBusinessAccountId']",
          message: "Use effectiveCustomerBusinessAccountId(ctx) for storefront identity. Disable this rule only when the JWT account is required.",
        },
        {
          selector: "MemberExpression[object.name='ctx'][property.name='activeOutletId']",
          message: "Do not use ctx.activeOutletId on storefront routes during Admin View. Prefer resolveStorefrontContext(ctx).",
        },
      ],
    },
  },
]);

export default eslintConfig;
