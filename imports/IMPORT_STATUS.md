# Max Booster repository import

- Repository: https://github.com/20lawsobk/maxbooster7.5.git
- Branch: main
- Source commit: 5d5f8f57394cfc95bb73588e2bf68795db71252e
- Source directory: `imports/maxbooster7.5`
- Import-time verification: all 11,327 tracked blobs matched their Git object hashes; no missing or modified blobs.
- Original source, dependency lockfiles, and configuration were preserved without migration into the template workspace.
- The original application's Node dependencies and nested MaxCore workspace dependencies are installed. Python dependencies are declared in the workspace-root `pyproject.toml` and locked in `uv.lock`.
- The `artifacts/maxbooster: web` workflow now runs the original app on its original port 5000 through the root preview. Its artifact configuration explicitly selects `live-awareness`, local MaxCore, and local PDIM.
- The empty development database was initialized from the existing Drizzle schemas plus migrations 0090, 0096, 0097, and 0099. A read-only schema comparison verified all 312 exported application tables with no drift. No production database was accessed.
- Verification: original landing page renders; `/api/health` returns OK; `/api/health/awareness/ready` reports fresh live signals (16 healthy sources at verification). All nine focused awareness-readiness/release-mode tests passed.
- Legacy LFS files remain pointers. They were not needed for this live-awareness verification. Missing Stripe and email credentials still limit those unrelated features; this is not a claim that all application features or production deployment have been verified.

## Unavailable upstream content

GitHub's LFS server rejected downloads with: "This repository exceeded its LFS budget." These two files retain their original LFS pointers rather than the model contents:

- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt`
- `external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt`

The repository also records a Gitlink at `maxbooster7.5` pointing to commit `2c9b739a89bb2334142ded99da14fe57878208b1`. There is no `.gitmodules` file specifying where that content can be downloaded. The Gitlink's contents are therefore not imported.

## LFS scope clarification

Source inspection confirms that the default `live-awareness` release preparation does not require the legacy LFS checkpoint. `script/prepare-release.ts` calls `modelReleaseRequirements`, which only requires that checkpoint for explicit `MAXCORE_SERVING_RELEASE=legacy`. PDIM capsule packaging excludes the legacy checkpoint and private training/registry state. The LFS download failure is therefore not a default release-packaging blocker; it does not by itself establish whether live model generation is ready. Qualified private model state must be available separately.

Large generated reports, scratch data, hardware build outputs, and sample audio remain present locally. Root ignore rules exclude these from new checkpoints and deployments to avoid adding large generated assets to this project's history.
