# Syncing the imported app to GitHub

The Replit Git root is the parent workspace. The upstream Max Booster app is
tracked at `imports/maxbooster7.5`, and `origin/main` is the app repository's
`main` branch. Do not push the workspace branch or run `git subtree push` from
the workspace root.

## Why this uses a source delta

The imported app snapshot is intentionally sparse: the checked-in workspace
snapshot has substantially fewer tracked files than the upstream root. A full
subtree split would interpret files omitted during import as deletions and can
remove valid upstream files.

The sync script compares the imported app against its original workspace
snapshot, then applies only that source delta to a clean detached checkout of
the latest upstream `main`. Files that were not imported are left alone.
Conflicting edits fail instead of overwriting upstream work. Deletions are
transferred only when a file existed in the imported baseline and was later
deleted from the imported app.

Each generated upstream commit has the fetched upstream `main` commit as its
parent and records the source tree and workspace commit in its message. Future
syncs use that recorded source tree as their next comparison point. This keeps
the Replit workspace history and upstream application history intact; it does
not rewrite either history or push the parent workspace.

## Verify before a real push

Run these commands from any location in the Replit workspace:

```sh
# Confirm that a clean checkout plus an unchanged source snapshot is a no-op.
bash scripts/sync-imported-app-to-github.sh \
  --source-ref 95e3a09bc810005dd1bd11ecb99b52a888b76e56

# Review the source-only commit and ask GitHub to validate the proposed update.
# This is still a dry run; it does not change GitHub.
bash scripts/sync-imported-app-to-github.sh
```

The script refuses dirty changes under the imported app, an unexpected GitHub
remote, a target branch unrelated to the recorded upstream base, a dirty
detached checkout, conflicting patches, and source refs older than the latest
synced snapshot. The second command prints the proposed commit and exact
changed-path list, then uses `git push --dry-run`. A standard non-force push is
the only remote write operation.

Only after reviewing both dry-run results, commit the intended source changes
to the Replit workspace and run the explicit write command:

```sh
MAXBOOSTER_GITHUB_SYNC_ENABLE_PUSH=1 \
  bash scripts/sync-imported-app-to-github.sh --push
```

The additional environment gate is required for every real push. A push race
or upstream advancement is rejected by Git's normal fast-forward rules; fetch
again and rerun the script rather than forcing an update. The script never
pushes automatically and never changes the workspace branch.

## Boundaries

- Target is fixed to `origin/main` for `20lawsobk/maxbooster7.5`.
- Only committed changes below `imports/maxbooster7.5` are transferred.
- The generated commit is a source snapshot delta, not a replay of workspace
  commits. Original workspace commits remain in the Replit repository.
- The upstream branch's existing commits remain ancestors of every sync
  commit. No force push, history replacement, workspace wrapper files, or
  workspace-level configuration are sent.
- Large model files retained as Git LFS pointers remain pointers; syncing does
  not retrieve or fabricate missing LFS content.
