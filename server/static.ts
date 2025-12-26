import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        // HTML should never be cached
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.match(/\.(js|css)$/)) {
        // Short cache for JS/CSS to ensure updates are picked up after deploy
        // Vite adds content hashes but Replit edge cache can still serve stale files
        res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
      } else if (filePath.match(/\.(woff2?|ttf|eot)$/)) {
        // Fonts can be cached longer as they rarely change
        res.setHeader('Cache-Control', 'public, max-age=604800');
      } else if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
        // Images cache for 1 day
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));

  app.use("*", (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
