---
name: MaxCore status route topology
description: Where GPU/backend status endpoints actually live in the internalized MaxCore subsystem, and why the vendored dashboard SPA is unreachable in this repo's dev setup
---

## The real request path for MaxCore-subsystem status endpoints
Main app (port 5000) → `server/routes/maxcoreProxy.ts` only forwards an explicit allowlist of content-gen/analysis/storage/training paths (its `GET_PATHS`/`POST_PATHS` arrays) to `getMaxcoreOrigin()`. It has **no** `/api/gpu/*` entries — GPU/backend status endpoints (`/gpu/status`, `/gpu/hyper/status`, `/gpu/silicon/status`, `/gpu/capabilities`) are **not** reachable through the public app surface. This is true of the pre-existing digital_gpu/hyper_gpu status endpoints too, not a gap introduced by any one feature — adding a new backend's status endpoint does not make it end-user-visible by itself.

`getMaxcoreOrigin()` resolves to the Node api-server child on loopback port 8090 (`config.maxcoreLocal.port`, env/port-contract name `maxcoreApi`) — NOT the raw Python process directly. That Node layer (`external/maxcore/artifacts/api-server`, clustered via Node `cluster` into N workers per `server/computeSizing.ts` sizing) mounts all its routers at the `/api` prefix (see `src/app.ts`: `app.use("/api", router)`). It in turn spawns and proxies to the actual Python model process on loopback port 9878 (`MODEL_API_PORT`/`maxcoreModelApi`). Confirmed by 404 response-format fingerprints: port 8090 404s look like Express (`Cannot GET ...` HTML), port 9878 404s look like FastAPI (`{"detail":"Not Found"}`).

**Why:** `server/services/maxcoreLocalSupervisor.ts` spawns `external/maxcore/artifacts/api-server` as ONE supervised child that owns the whole Python lifecycle underneath it — the main app never talks to Python directly, and nothing here is externally port-mapped (only port 5000 is public per `.replit`'s port contract), so all of 8090/9878 are loopback-only regardless of what routes exist on them.

**How to apply:** To make a new MaxCore-subsystem capability actually visible to real users/the Replit preview, you must explicitly add its path to `maxcoreProxy.ts`'s `GET_PATHS`/`POST_PATHS` — that's a deliberate public-API-surface decision; don't do it silently as a side effect of unrelated work, and don't assume a route is "done" just because it's wired inside the MaxCore subtree. To verify a new internal status endpoint end-to-end without that bridge, curl `http://127.0.0.1:8090/api/<path>` directly (not port 5000, not port 9878 — both give misleading 404s for a route that's actually fine).

## The vendored `ai-dashboard` SPA is unreachable in this repo's dev setup
`external/maxcore/artifacts/api-server/src/app.ts` only serves the built `ai-dashboard` static bundle + SPA fallback when `NODE_ENV === "production"`. `maxcoreLocalSupervisor.ts` always spawns the child with `NODE_ENV: "development"` explicitly. Net effect: the imported MaxCore dashboard (React pages under `external/maxcore/artifacts/ai-dashboard/src/pages`) can **never** be hit over HTTP in this repo's actual running configuration — there's no route for `/` in dev mode, so it 404s regardless of build state.

**How to apply:** Don't try to Screenshot or curl the dashboard for verification. Verify dashboard page correctness by (a) typechecking it and (b) diffing the JSON field names it reads against the live endpoint's actual response shape (fetched via the port-8090 path above) instead.

## Adding a new typed API endpoint to the MaxCore subtree
`external/maxcore/lib/api-spec/openapi.yaml` is the source of truth; `external/maxcore/lib/api-spec/orval.config.ts` + its codegen script regenerate BOTH `lib/api-client-react` (react-query hooks) and `lib/api-zod` (zod schemas) from that one spec in a single run. The generated files in both packages are marked do-not-edit-manually — edit the OpenAPI spec and re-run the codegen script instead of hand-editing `generated/api.ts`.
