import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";

const viteLogger = createLogger();

export async function createViteRuntime(server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: {
      server,
      path: "/vite-hmr",
      timeout: 120000, // 2 minutes - prevents page reload during long uploads
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger?.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  return {
    middleware: vite.middlewares,
    registerSpaFallback(app: Express) {
      app.use("/{*splat}", async (req, res, next) => {
        const url = req.originalUrl;

        try {
          const clientTemplate = path.resolve(
            import.meta.dirname,
            "..",
            "client",
            "index.html",
          );

          // Always read the current template so source edits remain visible.
          let template = await fs.promises.readFile(clientTemplate, "utf-8");
          template = template.replace(
            `src="/src/main.tsx"`,
            `src="/src/main.tsx?v=${Date.now()}"`,
          );
          const page = await vite.transformIndexHtml(url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(page);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    },
  };
}

export type ViteRuntime = Awaited<ReturnType<typeof createViteRuntime>>;

export async function setupVite(server: Server, app: Express) {
  const runtime = await createViteRuntime(server);
  app.use(runtime.middleware);
  runtime.registerSpaFallback(app);
}
