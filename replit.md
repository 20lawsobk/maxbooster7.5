# Max Booster

The active application is imported unchanged under `imports/maxbooster7.5`.
`artifacts/maxbooster` is a runtime wrapper, not a replacement frontend.
See `artifacts/maxbooster/README.md` for setup and verification boundaries.
The remaining sections below describe the original workspace template, not the imported application's architecture.

## Active application

- Managed workflow: `artifacts/maxbooster: web`, serving the original app on port 5000.
- Install imported Node dependencies: `pnpm --filter @workspace/maxbooster run setup`.
- Python dependencies: root `pyproject.toml` and `uv.lock`.
- Preview: `/`; awareness readiness: `/api/health/awareness/ready`.
- Live awareness uses configured current sources and does not require already-trained data or legacy LFS assets.
- Do not redesign, replace authentication, or migrate the original architecture just to fit the template.
- Development schema setup and checks are documented in `imports/IMPORT_STATUS.md`; production was not changed.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
