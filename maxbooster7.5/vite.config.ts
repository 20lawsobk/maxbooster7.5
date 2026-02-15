import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
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
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks: (id) => {
          // Studio chunk (heaviest page)
          if (id.includes('/studio/')) {
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

            // Utils
            if (id.includes('date-fns') || id.includes('zod') || id.includes('recharts')) {
              return 'vendor-utils';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    modulePreload: {
      polyfill: false,
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "wouter",
      "@tanstack/react-query",
      "framer-motion",
      "zustand",
      "i18next",
      "react-i18next",
    ],
  },
});
