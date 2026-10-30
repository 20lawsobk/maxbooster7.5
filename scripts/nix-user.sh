#!/usr/bin/env bash
# User-owned Nix CLI, independent of Replit's inaccessible shared store.
set -euo pipefail

command_name="$(basename "$0")"
case "$command_name" in
  nix|nix-build|nix-shell|nix-instantiate|nix-store|nix-env) ;;
  nix-user.sh) command_name=nix ;;
  *) echo "Unsupported Nix command: $command_name" >&2; exit 64 ;;
esac

# Use a verified installed release, not whichever executable appears on PATH
# (which would recurse through these launchers).
nix_bin=""
for candidate in /nix/store/*-nix-2.28.4/bin/nix; do
  if [[ -x "$candidate" ]] && [[ "$("$candidate" --version)" == "nix (Nix) 2.28.4" ]]; then
    nix_bin="${candidate%/nix}"
    break
  fi
done
if [[ -z "$nix_bin" || ! -x "$nix_bin/$command_name" ]]; then
  echo "Nix 2.28.4 is not available in the system store. Reinstall it before using this launcher." >&2
  exit 127
fi

user_home="$(getent passwd "$(id -u)" | cut -d: -f6)"
if [[ "$user_home" != /* ]]; then
  echo "Cannot resolve the current user's home directory from the account database." >&2
  exit 1
fi
base="$user_home/.local/share/nix-user"
if [[ "$base" == *'?'* || "$base" == *'&'* || "$base" == *'%'* || "$base" == *'#'* ]]; then
  echo "Home directory contains characters requiring store-URL encoding." >&2
  exit 64
fi

# Logical and physical store locations must agree: a relocated /nix/store
# requires mount namespaces that this workspace does not provide.
if [[ ! -x /bin/bash ]]; then
  echo "The local Nix shell requires /bin/bash." >&2
  exit 127
fi
exec env HOME="$user_home" NIX_BUILD_SHELL=/bin/bash \
  PATH="$user_home/.local/bin:${PATH:?PATH must be set}" "$nix_bin/$command_name" \
  --store "local?store=$base/store&state=$base/state&log=$base/log" \
  --option build-users-group "" \
  --option sandbox false \
  "$@"
