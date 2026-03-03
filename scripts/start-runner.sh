#!/bin/bash
set -e

RUNNER_DIR="/tmp/github-runner"
RUNNER_VERSION="2.332.0"
RUNNER_WORK="/tmp/runner-work"
REPO="https://github.com/20lawsobk/maxbooster7.5"

export LD_LIBRARY_PATH="$HOME/.nix-profile/lib:${LD_LIBRARY_PATH}"
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

mkdir -p "$RUNNER_WORK"

# Pre-install build tools via nix if not present
echo "Checking build tools..."
nix-env -iA nixpkgs.fakeroot nixpkgs.rpm nixpkgs.libarchive nixpkgs.jdk nixpkgs.icu 2>/dev/null | grep "installing" || true

# Ensure nix tools are in PATH
export PATH="$HOME/.nix-profile/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/.nix-profile/lib:${LD_LIBRARY_PATH}"

if [ ! -f "$RUNNER_DIR/run.sh" ]; then
  echo "Downloading runner v$RUNNER_VERSION..."
  mkdir -p "$RUNNER_DIR"
  curl -sL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    -o /tmp/runner.tar.gz
  tar xzf /tmp/runner.tar.gz -C "$RUNNER_DIR"
  echo "Runner extracted."
fi

if [ ! -f "$RUNNER_DIR/.runner" ]; then
  echo "Registering runner..."
  REG_TOKEN=$(curl -s -X POST \
    -H "Authorization: token ${GITHUB_PAT}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/20lawsobk/maxbooster7.5/actions/runners/registration-token" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")

  if [ -z "$REG_TOKEN" ]; then
    echo "ERROR: Could not get registration token. Check GITHUB_PAT."
    exit 1
  fi

  cd "$RUNNER_DIR"
  ./config.sh \
    --url "$REPO" \
    --token "$REG_TOKEN" \
    --name "replit-runner-1" \
    --labels "self-hosted,linux,x64,replit" \
    --work "$RUNNER_WORK" \
    --unattended \
    --replace
  echo "Runner registered."
fi

echo "Starting GitHub Actions runner..."
cd "$RUNNER_DIR"
exec ./run.sh
