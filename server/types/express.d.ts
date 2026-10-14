/**
 * Global Express Request augmentation.
 *
 * This mirrors (and is the canonical home for) the `declare global` block in
 * server/routes.ts. It exists as a standalone declaration file so EVERY
 * compile graph — including partial ones that never import routes.ts — sees
 * `req.user`, `req.isAuthenticated()`, and (via the express-session import)
 * `req.session`. Without this, files that only import `express` fail with
 * TS2339 on those properties.
 */
import "express-session";
import "http";

// Express's raw-body parser stores the exact unparsed bytes on IncomingMessage.
// Declare it in a shared .d.ts file so route-level typechecks need not import
// the server bootstrap (server/index.ts) to see the field.
declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Keep session-specific fields in a declaration file included by both server
// and bounded TypeScript checks, instead of hiding them inside server/index.ts.
declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}
// Pulls in multer's global Express.Multer.File / req.file / req.files
// augmentation for graphs that use uploads without importing multer directly.
import "multer";

declare global {
  namespace Express {
    interface Request {
      user?: import("../../shared/schema.js").User;
      isAuthenticated(): this is Request & {
        user: import("../../shared/schema.js").User;
      };
    }
  }
}

export {};
