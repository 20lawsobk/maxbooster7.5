#!/usr/bin/env bash
set -Eeuo pipefail

readonly REMOTE="origin"
readonly BRANCH="main"
readonly PREFIX="imports/maxbooster7.5"
readonly IMPORT_ANCHOR="95e3a09bc810005dd1bd11ecb99b52a888b76e56"
readonly UPSTREAM_BASE="5d5f8f57394cfc95bb73588e2bf68795db71252e"

source_ref="HEAD"
mode="dry-run"

usage() {
  cat <<'USAGE'
Usage: scripts/sync-imported-app-to-github.sh [--source-ref COMMIT] [--dry-run | --push]

The default is a no-write dry run. A real push additionally requires:
  MAXBOOSTER_GITHUB_SYNC_ENABLE_PUSH=1

The target is fixed to origin/main. The source is only
imports/maxbooster7.5, and uncommitted changes in that source directory are
rejected. The parent Replit workspace is never pushed.
USAGE
}

fail() {
  printf 'GitHub sync refused: %s\n' "$*" >&2
  exit 1
}

while (($#)); do
  case "$1" in
    --source-ref)
      (($# >= 2)) || fail "--source-ref requires a commit or ref"
      source_ref="$2"
      shift 2
      ;;
    --dry-run)
      [[ "$mode" == "dry-run" ]] || fail "choose only one of --dry-run or --push"
      mode="dry-run"
      shift
      ;;
    --push)
      [[ "$mode" == "dry-run" ]] || fail "choose only one of --dry-run or --push"
      mode="push"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

if [[ "$mode" == "push" && "${MAXBOOSTER_GITHUB_SYNC_ENABLE_PUSH:-}" != "1" ]]; then
  fail "--push requires MAXBOOSTER_GITHUB_SYNC_ENABLE_PUSH=1; dry runs never write"
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir/.." rev-parse --show-toplevel)" ||
  fail "could not locate the Replit workspace Git root"
cd "$repo_root"

[[ "$(git rev-parse --show-toplevel)" == "$repo_root" ]] ||
  fail "unexpected Git root"
git cat-file -e "${IMPORT_ANCHOR}^{commit}" ||
  fail "the imported-source history anchor is missing"
git cat-file -e "${UPSTREAM_BASE}^{commit}" ||
  fail "the upstream source commit is missing"
git merge-base --is-ancestor "$IMPORT_ANCHOR" HEAD ||
  fail "the current workspace history does not contain the imported-source anchor"
git merge-base --is-ancestor "$UPSTREAM_BASE" HEAD ||
  fail "the current workspace history does not contain the recorded upstream source commit"

source_commit="$(git rev-parse --verify --end-of-options "${source_ref}^{commit}")" ||
  fail "source ref is not a commit"
git merge-base --is-ancestor "$IMPORT_ANCHOR" "$source_commit" ||
  fail "source ref predates the imported-source anchor"
git merge-base --is-ancestor "$source_commit" HEAD ||
  fail "source ref is not part of the current Replit workspace history"

dirty_source="$(git status --porcelain=v1 --untracked-files=all -- "$PREFIX")"
[[ -z "$dirty_source" ]] ||
  fail "commit or discard changes under $PREFIX before syncing"

fetch_urls_output="$(git remote get-url --all "$REMOTE")" ||
  fail "remote $REMOTE is not configured"
push_urls_output="$(git remote get-url --push --all "$REMOTE")" ||
  fail "push URL for $REMOTE is not configured"
mapfile -t fetch_urls <<<"$fetch_urls_output"
mapfile -t push_urls <<<"$push_urls_output"
[[ "${#fetch_urls[@]}" == 1 ]] ||
  fail "remote $REMOTE must have exactly one fetch URL"
[[ "${#push_urls[@]}" == 1 ]] ||
  fail "remote $REMOTE must have exactly one push URL"
expected_urls=(
  "https://github.replit.internal/20lawsobk/maxbooster7.5.git"
  "https://github.com/20lawsobk/maxbooster7.5.git"
  "git@github.com:20lawsobk/maxbooster7.5.git"
  "ssh://git@github.com/20lawsobk/maxbooster7.5.git"
)
url_is_expected() {
  local candidate="$1" expected
  for expected in "${expected_urls[@]}"; do
    [[ "$candidate" == "$expected" ]] && return 0
  done
  return 1
}
url_is_expected "${fetch_urls[0]}" ||
  fail "fetch URL for $REMOTE is not the configured Max Booster GitHub repository"
url_is_expected "${push_urls[0]}" ||
  fail "push URL for $REMOTE is not the configured Max Booster GitHub repository"

git fetch --no-tags "$REMOTE" "refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH"
target_ref="refs/remotes/$REMOTE/$BRANCH"
target_commit="$(git rev-parse --verify "${target_ref}^{commit}")" ||
  fail "could not resolve $REMOTE/$BRANCH"
git merge-base --is-ancestor "$UPSTREAM_BASE" "$target_commit" ||
  fail "$REMOTE/$BRANCH does not descend from the imported upstream source commit"

anchor_tree="$(git rev-parse --verify "${IMPORT_ANCHOR}:${PREFIX}")" ||
  fail "could not read the imported app snapshot"
source_tree="$(git rev-parse --verify "${source_commit}:${PREFIX}")" ||
  fail "source ref does not contain $PREFIX"

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/maxbooster-github-sync.XXXXXX")"
checkout="$temp_root/checkout"
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -d "$checkout" ]]; then
    if ! git worktree remove --force "$checkout" >/dev/null; then
      printf 'Could not remove temporary Git worktree: %s\n' "$checkout" >&2
      status=1
    fi
  fi
  if [[ -d "$temp_root" ]] && ! rm -rf -- "$temp_root"; then
    printf 'Could not remove temporary sync directory: %s\n' "$temp_root" >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT

GIT_LFS_SKIP_SMUDGE=1 git worktree add --detach "$checkout" "$target_ref"
checkout_status="$(git -C "$checkout" status --porcelain=v1 --untracked-files=all)"
[[ -z "$checkout_status" ]] ||
  fail "the detached $REMOTE/$BRANCH checkout is not clean"

last_sync_commit="$(
  git -C "$checkout" log -1 --format=%H \
    --grep='^MaxBooster-Workspace-Source-Tree: ' "$target_commit"
)"
previous_source_tree="$anchor_tree"
if [[ -n "$last_sync_commit" ]]; then
  last_sync_message="$(git -C "$checkout" show -s --format=%B "$last_sync_commit")"
  previous_source_tree="$(
    printf '%s\n' "$last_sync_message" |
      sed -n 's/^MaxBooster-Workspace-Source-Tree: //p' |
      tail -n 1
  )"
  last_source_commit="$(
    printf '%s\n' "$last_sync_message" |
      sed -n 's/^MaxBooster-Workspace-Source-Commit: //p' |
      tail -n 1
  )"
  [[ "$previous_source_tree" =~ ^[0-9a-f]{40}$ ]] ||
    fail "latest sync commit has an invalid source-tree marker"
  [[ "$last_source_commit" =~ ^[0-9a-f]{40}$ ]] ||
    fail "latest sync commit has an invalid source-commit marker"
  git cat-file -e "${previous_source_tree}^{tree}" ||
    fail "source tree from the latest sync is unavailable in this workspace"
  git cat-file -e "${last_source_commit}^{commit}" ||
    fail "source commit from the latest sync is unavailable in this workspace"
  git merge-base --is-ancestor "$last_source_commit" "$source_commit" ||
    fail "source ref predates the latest source snapshot already synced to GitHub"
fi

if git diff --quiet "$previous_source_tree" "$source_tree"; then
  printf 'NO-OP: %s is already synchronized with %s/%s.\n' "$PREFIX" "$REMOTE" "$BRANCH"
  printf 'Verified: clean detached checkout at %s.\n' "$target_commit"
  exit 0
fi

patch_file="$temp_root/source-delta.patch"
index_file="$temp_root/sync-index"
git diff --binary --no-ext-diff --no-renames \
  "$previous_source_tree" "$source_tree" >"$patch_file"
[[ -s "$patch_file" ]] || fail "source trees differ but produced no patch"

GIT_INDEX_FILE="$index_file" git -C "$checkout" read-tree "$target_commit"
GIT_INDEX_FILE="$index_file" git -C "$checkout" apply --cached --check --binary "$patch_file" ||
  fail "source changes do not apply cleanly to current $REMOTE/$BRANCH; resolve upstream overlap first"
GIT_INDEX_FILE="$index_file" git -C "$checkout" apply --cached --binary "$patch_file"

changed_paths=0
while IFS= read -r -d '' path; do
  [[ "$path" != /* && "$path" != .. && "$path" != ../* && "$path" != */../* ]] ||
    fail "source diff contains an unsafe path"
  [[ "$path" != .git && "$path" != .git/* ]] ||
    fail "source diff attempts to modify Git metadata"
  changed_paths=$((changed_paths + 1))
done < <(
  GIT_INDEX_FILE="$index_file" \
    git -C "$checkout" diff --cached --name-only -z "$target_commit"
)
((changed_paths > 0)) || fail "source diff produced no staged paths"

git -C "$checkout" var GIT_AUTHOR_IDENT >/dev/null ||
  fail "Git author identity is not configured"
git -C "$checkout" var GIT_COMMITTER_IDENT >/dev/null ||
  fail "Git committer identity is not configured"
new_tree="$(GIT_INDEX_FILE="$index_file" git -C "$checkout" write-tree)"
new_commit="$(
  git -C "$checkout" commit-tree "$new_tree" -p "$target_commit" \
  -m "Sync imported Max Booster source" \
  -m "MaxBooster-Workspace-Source-Tree: $source_tree" \
    -m "MaxBooster-Workspace-Source-Commit: $source_commit"
)"
[[ "$(git -C "$checkout" rev-parse "${new_commit}^")" == "$target_commit" ]] ||
  fail "sync commit is not a direct child of the fetched upstream branch"
[[ -z "$(git -C "$checkout" status --porcelain=v1 --untracked-files=all)" ]] ||
  fail "source preparation changed the clean detached checkout"

printf 'Prepared source-only commit %s (%s changed paths).\n' "$new_commit" "$changed_paths"
printf 'Parent: %s; source snapshot: %s; source commit: %s.\n' \
  "$target_commit" "$source_tree" "$source_commit"
printf 'Files in the candidate update:\n'
git -C "$checkout" diff --name-status "$target_commit" "$new_commit"

if [[ "$mode" == "dry-run" ]]; then
  git -C "$checkout" push --dry-run "$REMOTE" "$new_commit:refs/heads/$BRANCH"
  printf 'DRY RUN ONLY: no remote branch was changed.\n'
else
  git -C "$checkout" push "$REMOTE" "$new_commit:refs/heads/$BRANCH"
  printf 'Pushed %s to %s/%s without force.\n' "$new_commit" "$REMOTE" "$BRANCH"
fi
