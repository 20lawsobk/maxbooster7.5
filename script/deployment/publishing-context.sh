#!/usr/bin/env bash
# Sourced by the historical publishing bootstrap, never by npm run build.
PUBLISHING_RUNNER_PID=''
PUBLISHING_RUNNER_STARTING=''
PUBLISHING_PENDING_SIGNAL=''

prepare_publishing_context() {
  local root
  root=$(pwd -P)
  if [[ "${DEPLOY_PACK-1}" != 1 || "${PUBLISH_PAYLOAD_CLEANUP-1}" != 1 ||
        "${PUBLISH_BUILD_ROOT-$root}" != "$root" ]]; then
    echo "Conflicting inherited publishing authorization. build.sh owns DEPLOY_PACK=1, PUBLISH_PAYLOAD_CLEANUP=1 and PUBLISH_BUILD_ROOT=current root; remove conflicting configuration." >&2
    return 1
  fi
  export DEPLOY_PACK=1 PUBLISH_PAYLOAD_CLEANUP=1 PUBLISH_BUILD_ROOT="$root"
  # The Publishing phase runner owns capsule packing; nested npm builds compile only.
  export PUBLISH_SHELL_PACKS_CAPSULES=1
  local identity
  identity=$(printf '%s' "$root" | sha256sum)
  identity=${identity%% *}
  exec 9>"/tmp/maxbooster-publishing-$identity.lock"
  if ! flock -n 9; then
    echo "Another publishing pipeline owns this root; refusing overlapping recovery/build/packing." >&2
    return 73
  fi
}

publishing_stop_runner() {
  local runner_pid="${PUBLISHING_RUNNER_PID:-}"
  [[ -n "$runner_pid" ]] || return 0

  echo "[bootstrap] Asking build runner $runner_pid to stop before releasing the publishing lock" >&2
  kill -TERM "$runner_pid" 2>/dev/null || true
  wait "$runner_pid" 2>/dev/null || true
  PUBLISHING_RUNNER_PID=''
}

publishing_handle_signal() {
  local signal_name="$1"
  local exit_code="$2"

  if [[ -z "${PUBLISHING_RUNNER_PID:-}" ]]; then
    if [[ "${PUBLISHING_RUNNER_STARTING:-}" == "1" ]]; then
      PUBLISHING_PENDING_SIGNAL="$signal_name"
      return 0
    fi
    echo "[bootstrap] Received $signal_name before the build runner started" >&2
    exit "$exit_code"
  fi

  echo "[bootstrap] Received $signal_name; forwarding it and waiting for owned build cleanup" >&2
  trap '' "$signal_name"
  kill -s "$signal_name" "$PUBLISHING_RUNNER_PID" 2>/dev/null || true
  wait "$PUBLISHING_RUNNER_PID" 2>/dev/null || true
  PUBLISHING_RUNNER_PID=''
  exit "$exit_code"
}

publishing_run_runner() {
  if [[ -n "${PUBLISHING_RUNNER_PID:-}" ]]; then
    echo "[bootstrap] Refusing to launch a second build runner" >&2
    return 2
  fi

  PUBLISHING_RUNNER_STARTING=1
  "$@" &
  PUBLISHING_RUNNER_PID=$!
  PUBLISHING_RUNNER_STARTING=''

  if [[ -n "${PUBLISHING_PENDING_SIGNAL:-}" ]]; then
    case "$PUBLISHING_PENDING_SIGNAL" in
      TERM) publishing_handle_signal TERM 143 ;;
      INT) publishing_handle_signal INT 130 ;;
      HUP) publishing_handle_signal HUP 129 ;;
    esac
  fi

  local status=0
  if wait "$PUBLISHING_RUNNER_PID"; then
    status=0
  else
    status=$?
  fi
  PUBLISHING_RUNNER_PID=''
  return "$status"
}

isolate_publishing_caches() {
  # $tools is an owned mktemp directory outside the payload. Existing bootstrap
  # and bootstrap cleanup removes it after the sequential build runner exits.
  export XDG_CACHE_HOME="$tools/cache/xdg"
  export npm_config_cache="$tools/cache/npm" NPM_CONFIG_CACHE="$tools/cache/npm"
  export NODE_COMPILE_CACHE="$tools/cache/node"
  export BOOSTERSTATE_CARGO_HOME="$tools/cache/cargo"
  export BOOSTERSTATE_PORTABLE_RUST_DIR="$tools/cache/rust-toolchain"
  export PIP_CACHE_DIR="$tools/cache/pip" UV_CACHE_DIR="$tools/cache/uv"
}
