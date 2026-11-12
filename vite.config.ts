import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
import { selectStripePublishableKey } from "./shared/stripeCredentials.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const stripePublishableKey =
    selectStripePublishableKey(process.env, mode === "production") ?? "";

  return {
  base: "/",
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_STRIPE_PUBLIC_KEY": JSON.stringify(stripePublishableKey),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
      "@plugins": path.resolve(__dirname, "built-in plugins dsp"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    target: "esnext",
    minify: "esbuild",
    cssMinify: true,
    sourcemap: false,
    cssCodeSplit: true,
    // Skip per-file gzip size reporting during build — saves 2-3s per build.
    // Actual brotli+gzip is still done by script/build.ts after Vite finishes.
    reportCompressedSize: false,
    // Inline assets smaller than 8 kB (icons, tiny SVGs) directly into the JS/CSS
    // bundle to eliminate extra round-trips on first load.
    assetsInlineLimit: 8192,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks: (id) => {
          const moduleId = id.replaceAll("\\", "/");

          // Studio chunk (heaviest page) — includes DSP plugin processors
          if (
            moduleId.includes("/studio/") ||
            moduleId.includes("built-in plugins dsp") ||
            moduleId.includes("@plugins/")
          ) {
            return "studio";
          }

          if (moduleId.includes("/node_modules/")) {
            // Keep optional telemetry out of the shared React runtime chunk.
            if (moduleId.includes("/node_modules/@sentry/")) {
              return "vendor-telemetry";
            }

            // Package-specific checks must precede core React matching. Many
            // unrelated package names contain the substring "react".
            if (moduleId.includes("/node_modules/@radix-ui/")) {
              return "vendor-ui";
            }
            if (
              moduleId.includes("/node_modules/class-variance-authority/") ||
              moduleId.includes("/node_modules/clsx/") ||
              moduleId.includes("/node_modules/tailwind-merge/") ||
              moduleId.includes("/node_modules/lucide-react/") ||
              moduleId.includes("/node_modules/cmdk/")
            ) {
              return "vendor-ui";
            }

            // Animation
            if (moduleId.includes("/node_modules/framer-motion/")) {
              return "vendor-animation";
            }

            // State management
            if (
              moduleId.includes("/node_modules/zustand/") ||
              moduleId.includes("/node_modules/i18next/") ||
              moduleId.includes("/node_modules/react-i18next/") ||
              moduleId.includes("/node_modules/immer/")
            ) {
              return "vendor-state";
            }

            // Charts (depends on React, must be separate)
            if (
              moduleId.includes("/node_modules/recharts/") ||
              /\/node_modules\/d3-[^/]+\//.test(moduleId) ||
              moduleId.includes("/node_modules/victory")
            ) {
              return "vendor-charts";
            }

            // Audio engine — Tone.js and Howler are heavy (~600KB+); isolate so
            // users who never visit the Studio page don't pay the download cost.
            if (
              moduleId.includes("/node_modules/tone/") ||
              moduleId.includes("/node_modules/howler/")
            ) {
              return "vendor-audio-engine";
            }

            // Canvas / WebGL — Pixi.js is very large (~1MB+); lazy-loaded only
            // by the visualizer/studio canvas pages.
            if (
              moduleId.includes("/node_modules/pixi.js/") ||
              moduleId.includes("/node_modules/@pixi/")
            ) {
              return "vendor-canvas";
            }

            // Forms — react-hook-form is medium weight, standalone
            if (
              moduleId.includes("/node_modules/react-hook-form/") ||
              moduleId.includes("/node_modules/@hookform/")
            ) {
              return "vendor-forms";
            }

            // Icons — @icons-pack/react-simple-icons contains hundreds of SVG
            // brand icons and is only used on specific pages (social, marketplace).
            // Isolating it prevents it from bloating any route chunk.
            if (
              moduleId.includes("/node_modules/@icons-pack/react-simple-icons/") ||
              moduleId.includes("/node_modules/simple-icons/")
            ) {
              return "vendor-icons";
            }

            // Utils (no React dependency)
            if (
              moduleId.includes("/node_modules/date-fns/") ||
              moduleId.includes("/node_modules/zod/")
            ) {
              return "vendor-utils";
            }

            // Only the actual core packages belong in the shared React chunk.
            if (
              moduleId.includes("/node_modules/react/") ||
              moduleId.includes("/node_modules/react-dom/") ||
              moduleId.includes("/node_modules/scheduler/") ||
              moduleId.includes("/node_modules/@tanstack/react-query/") ||
              moduleId.includes("/node_modules/wouter/") ||
              moduleId.includes("/node_modules/use-sync-external-store/")
            ) {
              return "vendor-react";
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    modulePreload: {
      polyfill: false,
      resolveDependencies(_filename, deps) {
        // Never eagerly preload heavy or rarely-needed chunks — let them load
        // on demand when the relevant route or feature is first accessed.
        const HEAVY = [
          "studio",
          "vendor-charts",
          "vendor-audio-engine",
          "vendor-canvas",
          "vendor-icons",
          "vendor-forms",
          "vendor-animation",
          "jspdf",
          "html2canvas",
          "index.es",
        ];
        return deps.filter((dep) => !HEAVY.some((h) => dep.includes(h)));
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    fs: {
      strict: false,
      allow: [__dirname],
      deny: ["**/.*"],
    },
    // Pre-transform critical source files at startup so the dep optimizer
    // finishes before the browser's first requests arrive, eliminating the
    // brief 504-storm that occurs when the optimizer is still running and the
    // browser hits a dep that isn't cached yet (e.g. after vite.config changes).
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/components/ui/dialog.tsx",
        "./src/components/ui/toast.tsx",
        "./src/components/ui/toaster.tsx",
        "./src/components/auth/AuthProvider.tsx",
      ],
    },
  },
  esbuild: {
    charset: "utf8",
  },
  optimizeDeps: {
    include: [
      // Core React
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      // Routing / data fetching
      "wouter",
      "@tanstack/react-query",
      // UI primitives — pre-bundling avoids per-request transforms in dev
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-popover",
      "@radix-ui/react-switch",
      "@radix-ui/react-slider",
      "@radix-ui/react-progress",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-avatar",
      "@radix-ui/react-separator",
      "@radix-ui/react-label",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-accordion",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-alert-dialog",
      // Animation
      "framer-motion",
      // State / i18n
      "zustand",
      "i18next",
      "react-i18next",
      // Forms
      "react-hook-form",
      "@hookform/resolvers",
      // Utils — bundled once, not re-parsed per import
      "zod",
      "date-fns",
      "clsx",
      "class-variance-authority",
      "tailwind-merge",
      // Charts (heavy but frequently used)
      "recharts",
    ],
    // Exclude server-only or native packages from browser pre-bundling
    exclude: ["@tensorflow/tfjs-node", "sharp", "bcrypt", "pg", "drizzle-orm"],
  },
  };
});
