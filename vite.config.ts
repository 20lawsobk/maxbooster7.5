import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
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
          // Studio chunk (heaviest page) — includes DSP plugin processors
          if (id.includes('/studio/') || id.includes('built-in plugins dsp') || id.includes('@plugins/')) {
            return 'studio';
          }

          if (id.includes('node_modules/')) {
            // React packages - check specific ones before generic 'react'
            if (id.includes('react/jsx-runtime') || id.includes('react/jsx-dev-runtime')) {
              return 'vendor-react';
            }
            if (id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'vendor-react';
            }
            if (id.includes('wouter')) {
              return 'vendor-react';
            }
            if (id.includes('react')) {
              return 'vendor-react';
            }

            // UI packages
            if (id.includes('@radix-ui')) {
              return 'vendor-ui';
            }
            if (id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge') || id.includes('lucide-react') || id.includes('cmdk')) {
              return 'vendor-ui';
            }

            // Animation
            if (id.includes('framer-motion')) {
              return 'vendor-animation';
            }

            // State management
            if (id.includes('zustand') || id.includes('i18next') || id.includes('react-i18next') || id.includes('immer')) {
              return 'vendor-state';
            }

            // Charts (depends on React, must be separate)
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
              return 'vendor-charts';
            }

            // Audio engine — Tone.js and Howler are heavy (~600KB+); isolate so
            // users who never visit the Studio page don't pay the download cost.
            if (id.includes('/tone/') || id.includes('tone/build') || id.includes('howler')) {
              return 'vendor-audio-engine';
            }

            // Canvas / WebGL — Pixi.js is very large (~1MB+); lazy-loaded only
            // by the visualizer/studio canvas pages.
            if (id.includes('pixi.js') || id.includes('@pixi/')) {
              return 'vendor-canvas';
            }

            // Forms — react-hook-form is medium weight, standalone
            if (id.includes('react-hook-form') || id.includes('@hookform')) {
              return 'vendor-forms';
            }

            // Icons — @icons-pack/react-simple-icons contains hundreds of SVG
            // brand icons and is only used on specific pages (social, marketplace).
            // Isolating it prevents it from bloating any route chunk.
            if (id.includes('@icons-pack/react-simple-icons') || id.includes('simple-icons')) {
              return 'vendor-icons';
            }

            // Utils (no React dependency)
            if (id.includes('date-fns') || id.includes('zod')) {
              return 'vendor-utils';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    modulePreload: {
      polyfill: false,
      resolveDependencies(filename, deps) {
        // Never eagerly preload heavy or rarely-needed chunks — let them load
        // on demand when the relevant route or feature is first accessed.
        const HEAVY = [
          'studio',
          'vendor-charts',
          'vendor-audio-engine',
          'vendor-canvas',
          'vendor-icons',
          'vendor-forms',
          'vendor-animation',
          'jspdf',
          'html2canvas',
          'index.es',
        ];
        return deps.filter(dep => !HEAVY.some(h => dep.includes(h)));
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
    exclude: [
      "@tensorflow/tfjs-node",
      "sharp",
      "bcrypt",
      "pg",
      "drizzle-orm",
    ],
  },
});
