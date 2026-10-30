import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, RequestHandler } from "express";

// Keep the request, not a pre-authentication snapshot: route authorization may
// populate req.user later. No public header/body field participates.
const requests = new AsyncLocalStorage<Request>();
export const maxcoreOwnerContext: RequestHandler = (req, _res, next) =>
  requests.run(req, next);

export function trustedMaxcoreOwner(explicitBackgroundOwner?: string): string | undefined {
  const req = requests.getStore();
  const owner = req ? (req.user as { id?: string } | undefined)?.id : explicitBackgroundOwner;
  return typeof owner === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(owner) ? owner : undefined;
}

export function bindMaxcoreOwner(body: Record<string, unknown>, owner?: string) {
  const clean = { ...body };
  for (const key of ["owner_id", "ownerId", "user_id", "userId", "trusted_owner",
    "trustedOwner", "_owner", "_auth", "auth_context"]) delete clean[key];
  if (owner) Object.assign(clean, { user_id: owner, userId: owner, owner_id: owner });
  return clean;
}