# Imported Max Booster runtime

This artifact launches the original application in `imports/maxbooster7.5`.
It does not use the generated frontend scaffold in this artifact's `src` directory.
The imported client, server, authentication, PDIM, and MaxCore supervisor remain the application implementation.

## Development

- Install Node dependencies: `pnpm --filter @workspace/maxbooster run setup`.
- Python dependencies are managed by the workspace-root `pyproject.toml` and `uv.lock`, including CPU PyTorch.
- Start/restart the managed `artifacts/maxbooster: web` workflow.
- Preserve port 5000: the imported launcher validates this against its own `.replit` port contract.
- The artifact routes `/`, `/api`, `/ws`, and `/socket.io` to the imported application.
- The template API uses a separate `/__template-api` prefix, so it cannot intercept application API calls.

## Database setup

This development project started with an empty database. The existing `npm run db:push`
command was run from the imported directory, followed by the original SQL migrations
`0090_data_runtime.sql`, `0096_fabric_deletion_journals.sql`,
`0097_hybrid_storage_metadata.sql`, and `0099_fabric_migration_journal.sql`.

These are operator-run development setup steps, not startup-time migrations.
Review existing data and migration history before applying them to any other database.
No production database was migrated.

## Live awareness

The service configuration sets `MAXCORE_SERVING_RELEASE=live-awareness`,
`MAXCORE_LOCAL=1`, and `PDIM_FORCE_REMOTE=0`.
Use `/api/health/awareness/ready` to verify fresh source-backed awareness.
The broader aggregate readiness includes other services and is not an awareness-only verdict.
Do not make awareness depend on a trained model or legacy LFS checkpoint.

## Boundaries

The original app runs, but missing payment/email credentials still affect their respective features.
The production build and all application journeys have not been verified.
