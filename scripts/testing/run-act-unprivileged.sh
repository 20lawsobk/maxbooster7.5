#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo "Refusing to run Act as root; invoke this script as an unprivileged user." >&2
  exit 77
fi

act_bin=${ACT_BIN:-$(command -v act || true)}
if [[ -z "$act_bin" && -x "$HOME/.local/bin/act" ]]; then
  act_bin="$HOME/.local/bin/act"
fi
if [[ -z "$act_bin" || ! -x "$act_bin" ]]; then
  echo "Act is unavailable; install it before running this local CI job." >&2
  exit 127
fi

# initdb rejects root. Match the host checkout's ownership inside the Act job
# container so disposable PostgreSQL fixtures run as the current CI-like user.
uid=$(id -u)
gid=$(id -g)
runner_user=$(id -un)
runner_home=${HOME:-$(getent passwd "$runner_user" | cut -d: -f6)}
platform_image=${ACT_PLATFORM_IMAGE:-catthehacker/ubuntu:act-latest}

# Keep local API keys and database URLs out of workflows; CI supplies its own
# test-only environment values in the workflow definition.
exec env -i \
  PATH="${PATH:-/usr/bin:/bin}" \
  HOME="$runner_home" \
  USER="$runner_user" \
  LOGNAME="$runner_user" \
  "$act_bin" \
    --platform "ubuntu-latest=${platform_image}" \
    --container-options "--user=${uid}:${gid} --env=HOME=/tmp/act-home" \
    "$@"
