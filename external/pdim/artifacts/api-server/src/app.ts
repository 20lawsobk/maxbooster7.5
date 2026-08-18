import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import compression from "compression";
import { randomUUID } from "crypto";
import router from "./routes";
import { rateLimitMiddleware } from "./middlewares/rateLimit.js";
import { backpressureMiddleware } from "./middlewares/backpressure.js";

const app: Express = express();

// Gzip/Brotli compress all JSON and text responses
app.use(compression());

app.use(cors());

// ── Request ID middleware ─────────────────────────────────────────────────────
// Stamps every request with a unique X-Request-ID so logs and error responses
// can be correlated end-to-end across client, proxy, and server.
app.use((req: Request, res: Response, next: NextFunction) => {
  const id =
    (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("X-Request-ID", id);
  next();
});

// ── Security headers ──────────────────────────────────────────────────────────
// Minimal hardening without pulling in helmet as a dep; these are the most
// impactful headers for an API + SPA serving sensitive storage tokens.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// 50 MB is generous for JSON payloads; actual file uploads go through multer, not this parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Scale middleware ──────────────────────────────────────────────────────────
// Order matters: backpressure first (cheapest check), then rate limit.
// Both run before any route handler allocates significant memory.
app.use(backpressureMiddleware);
app.use(rateLimitMiddleware);

app.use("/api", router);

// ── 404 handler ───────────────────────────────────────────────────────────────
// Must come after all routes. Returns JSON so clients always get a parseable body.
app.use((req: Request, res: Response) => {
  res
    .status(404)
    .json({ error: "Not found", requestId: req.headers["x-request-id"] });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Catches any error thrown or passed to next() inside route handlers.
// Returns JSON instead of Express's default HTML error page.
 
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = (err as any)?.status ?? (err as any)?.statusCode ?? 500;
  console.error(
    `[Express] Unhandled route error (reqId=${req.headers["x-request-id"]}):`,
    err,
  );
  res
    .status(status)
    .json({ error: message, requestId: req.headers["x-request-id"] });
});

export default app;
