// ESLint v9 flat config — Max Booster.
// Rules during the production-hardening rollout are intentionally lenient on
// type erosion (`any`) and console.log usage; CI's `lint` job uses
// `--max-warnings=99999 || true` for visibility, plus `--quiet` for the hard
// error gate. Ratchet rules to `error` over time as cleanups land.
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import noDivisionByZero from "./eslint-rules/no-division-by-zero.js";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "android/**",
      "ios/**",
      "electron/dist/**",
      "**/*.cjs",
      "**/*.mjs",
      "server/services/diffusion/**",
      "**/__generated__/**",
      "attached_assets/**",
      "public/**",
      "logs/**",
      ".local/**",
      ".replit/**",
      ".cache/**",
      "vite.config.ts.timestamp-*",
      "drizzle/**",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Node + browser + DOM + worker + service-worker — superset, lint
        // doesn't actually run code so the cross-env globals are safe.
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        queueMicrotask: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        crypto: "readonly",
        performance: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        location: "readonly",
        history: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLFormElement: "readonly",
        Element: "readonly",
        Event: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        FocusEvent: "readonly",
        CustomEvent: "readonly",
        WebSocket: "readonly",
        IntersectionObserver: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        atob: "readonly",
        btoa: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "no-division-by-zero": { rules: { "no-division-by-zero": noDivisionByZero } },
    },
    rules: {
      // Re-import recommended TS rules manually (flat config doesn't inherit).
      ...tseslint.configs.recommended.rules,

      // HARDENING: Division-by-zero prevention (Recommendation 1)
      "no-division-by-zero/no-division-by-zero": "error",

      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-wrapper-object-types": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-prototype-builtins": "off",
      "no-async-promise-executor": "warn",
      "no-case-declarations": "off",
      "no-undef": "off",
      "no-redeclare": "off",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-useless-escape": "warn",
      "no-control-regex": "off",
      "no-misleading-character-class": "warn",
      "no-irregular-whitespace": "warn",
      "no-fallthrough": "warn",
      // Stylistic rules — useful as informational warnings, but not bugs.
      // Keep them visible as warnings so they don't block CI's `--quiet` gate.
      "preserve-caught-error": "warn",
      "no-useless-assignment": "warn",
      "@typescript-eslint/no-namespace": "warn",
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "tests/**/*.ts",
      "scripts/**/*.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
];
