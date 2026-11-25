import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import { createClientViteConfig } from "../vite.config";
import fs from "fs";
import path from "path";
import { verificationMetaTagForHost } from "./services/tiktokSiteVerification.js";

const viteLogger = createLogger();

export async function createViteRuntime(server: Server) {
  const clientViteConfig = createClientViteConfig("development");
  const serverOptions = {
    ...clientViteConfig.server,
    middlewareMode: true,
    hmr: {
      server,
      path: "/vite-hmr",
      timeout: 120000, // 2 minutes - prevents page reload during long uploads
    },
    allowedHosts: true as const,
  };

  const inlineConfig = {
    ...clientViteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger?.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  } as Parameters<typeof createViteServer>[0];
  const vite = await createViteServer(inlineConfig);

  async function renderIndexHtml(url: string) {
    const clientTemplate = path.resolve(
      import.meta.dirname,
      "..",
      "client",
      "index.html",
    );
    const template = await fs.promises.readFile(clientTemplate, "utf-8");
    return vite.transformIndexHtml(url, template);
  }

  return {
    middleware: vite.middlewares,
    registerVerificationRoot(app: Express) {
      app.get("/", async (req, res, next) => {
        const verificationTag = verificationMetaTagForHost(
          req.get("host"),
          process.env.REPLIT_DEV_DOMAIN,
        );
        if (!verificationTag) {
          next();
          return;
        }

        try {
          let page = await renderIndexHtml(req.originalUrl);
          const headClose = page.toLowerCase().lastIndexOf("</head>");
          if (headClose < 0) {
            throw new Error(
              "Cannot serve the dev page without its TikTok verification metadata.",
            );
          }
          page = `${page.slice(0, headClose)}${verificationTag}\n${page.slice(headClose)}`;
          res.status(200).set({ "Content-Type": "text/html" }).end(page);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    },
    registerSpaFallback(app: Express) {
      app.use("/{*splat}", async (req, res, next) => {
        const url = req.originalUrl;

        try {
          // Always read the current template so source edits remain visible.
          // Keep the Vite entry URL stable: a timestamp query creates a new
          // module-graph identity on every navigation/reload and retains stale
          // transformed entry modules in the long-lived dev server.
          const page = await renderIndexHtml(url);
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
  runtime.registerVerificationRoot(app);
  app.use(runtime.middleware);
  runtime.registerSpaFallback(app);
}
