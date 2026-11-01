#!/usr/bin/env bash
# Sourced by the historical publishing bootstrap, never by npm run build.
prepare_publishing_context() {
  local root
  root=$(pwd -P)
  if [[ "${DEPLOY_PACK-1}" != 1 || "${PUBLISH_PAYLOAD_CLEANUP-1}" != 1 ||
        "${PUBLISH_BUILD_ROOT-$root}" != "$root" ]]; then
    echo "Conflicting inherited publishing authorization. build.sh owns DEPLOY_PACK=1, PUBLISH_PAYLOAD_CLEANUP=1 and PUBLISH_BUILD_ROOT=current root; remove conflicting configuration." >&2
    return 1
  fi
  export DEPLOY_PACK=1 PUBLISH_PAYLOAD_CLEANUP=1 PUBLISH_BUILD_ROOT="$root"
  # Only the historical executive packs. Its nested npm build compiles only.
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

isolate_publishing_caches() {
  # $tools is an owned mktemp directory outside the payload. Existing bootstrap
  # and executive cleanup remove it only after child processes have drained.
  export XDG_CACHE_HOME="$tools/cache/xdg"
  export npm_config_cache="$tools/cache/npm" NPM_CONFIG_CACHE="$tools/cache/npm"
  export NODE_COMPILE_CACHE="$tools/cache/node"
  export BOOSTERSTATE_CARGO_HOME="$tools/cache/cargo"
  export PIP_CACHE_DIR="$tools/cache/pip" UV_CACHE_DIR="$tools/cache/uv"
}
