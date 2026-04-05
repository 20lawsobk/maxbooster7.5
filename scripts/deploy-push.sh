#!/usr/bin/env bash
# Auto-push current codebase to GitHub on every Replit deployment.
# Runs as the first step of the deployment build command.
# Requires: GITHUB_PAT secret set in Replit environment.

set -euo pipefail

GITHUB_OWNER="20lawsobk"
GITHUB_REPO="maxbooster7.5"
GIT_USER_NAME="20lawsobk"
GIT_USER_EMAIL="brandonlawson777@outlook.com"
BRANCH="main"

echo "========================================"
echo "  Max Booster — Auto GitHub Push"
echo "========================================"

if [ -z "${GITHUB_PAT:-}" ]; then
  echo "⚠️  GITHUB_PAT not set — skipping auto-push"
  exit 0
fi

REPO_URL="https://${GITHUB_PAT}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git"

# Configure git identity
git config user.email "$GIT_USER_EMAIL"
git config user.name "$GIT_USER_NAME"

# Point origin at the authenticated URL (token is not logged)
git remote set-url origin "$REPO_URL"

# Stage everything
git add -A

# Only commit if there are staged changes
if git diff --cached --quiet; then
  echo "✅ Nothing new to commit — pushing existing HEAD to GitHub..."
else
  DEPLOY_TS=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
  COMMIT_MSG="🚀 Deploy: ${DEPLOY_TS} [auto]"
  git commit -m "$COMMIT_MSG"
  echo "✅ Committed: $COMMIT_MSG"
fi

# Push — prefer --force-with-lease (safer than --force)
if git push origin "$BRANCH" --force-with-lease 2>/dev/null; then
  echo "✅ Pushed to github.com/${GITHUB_OWNER}/${GITHUB_REPO} (${BRANCH})"
else
  echo "⚠️  force-with-lease failed, falling back to regular push..."
  git push origin "$BRANCH"
  echo "✅ Pushed to github.com/${GITHUB_OWNER}/${GITHUB_REPO} (${BRANCH})"
fi

# Restore remote URL without token so it's not stored in git config
git remote set-url origin "https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git"

echo "========================================"
echo "  GitHub push complete — starting build"
echo "========================================"
