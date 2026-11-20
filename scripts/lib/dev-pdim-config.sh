#!/usr/bin/env bash

# Give the workspace preview a durable namespace and local journal that are
# separate from any deployment or inherited PDIM settings.
configure_dev_pdim() {
  local workspace_root="$1"
  local namespace="${MAXBOOSTER_DEV_PDIM_BUCKET_NAMESPACE:-maxbooster-workspace-dev-v2}"
  local production_namespace="${MAXBOOSTER_PRODUCTION_PDIM_BUCKET_NAMESPACE:-${PDIM_BUCKET_NAMESPACE:-}}"
  local local_store="${workspace_root}/data/local-pdim-dev-v2-store.json"
  local inherited_store="${LOCAL_PDIM_STORE_FILE:-${workspace_root}/data/local-pdim-store.json}"
  local normalized_local normalized_inherited

  if [[ ! "$namespace" =~ ^[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*$ ]]; then
    echo "[start-dev] FATAL: MAXBOOSTER_DEV_PDIM_BUCKET_NAMESPACE is invalid" >&2
    return 1
  fi
  if [[ -n "$production_namespace" && "$namespace" == "$production_namespace" ]]; then
    echo "[start-dev] FATAL: development PDIM namespace must differ from the configured production namespace" >&2
    return 1
  fi

  normalized_local="$(realpath -m -- "$local_store")"
  normalized_inherited="$(realpath -m -- "$inherited_store")"
  if [[ "$normalized_local" == "$normalized_inherited" ]]; then
    echo "[start-dev] FATAL: development PDIM journal must differ from the inherited local journal" >&2
    return 1
  fi

  export PDIM_PERSISTENCE="app-storage"
  export PDIM_BUCKET_NAMESPACE="$namespace"
  export LOCAL_PDIM_STORE_FILE="$normalized_local"
}
