#!/usr/bin/env bash
# Build-only, pinned Rust environment for the production BoosterState sidecar.
# Keeping this behind nix-shell avoids adding Rust's closure to replit.nix and
# therefore to the production runtime image.
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_ROOT="$(cd "${_SCRIPT_DIR}/.." && pwd)"
_MANIFEST="${_ROOT}/boosterstate/Cargo.toml"
_LOCKFILE="${_ROOT}/boosterstate/Cargo.lock"
_TARGET_DIR="${BOOSTERSTATE_TARGET_DIR:-${_ROOT}/boosterstate/target}"
_OUTPUT_DIR="${BOOSTERSTATE_OUTPUT_DIR:-${_ROOT}/bin}"
_CARGO_HOME="${BOOSTERSTATE_CARGO_HOME:-${_ROOT}/.cache/boosterstate-cargo}"
_PINNED_NIXPKGS="https://github.com/NixOS/nixpkgs/archive/650e572363c091045cdbc5b36b0f4c1f614d3058.tar.gz"

[[ -f "$_MANIFEST" ]] || {
  echo "[BoosterStateBuild] FATAL: missing ${_MANIFEST}" >&2
  exit 1
}
[[ -f "$_LOCKFILE" ]] || {
  echo "[BoosterStateBuild] FATAL: Cargo.lock is required for --locked production builds" >&2
  exit 1
}
command -v nix-shell >/dev/null 2>&1 || {
  echo "[BoosterStateBuild] FATAL: nix-shell is required for the pinned build-only Rust toolchain" >&2
  exit 1
}

mkdir -p "$_CARGO_HOME" "$_TARGET_DIR" "$_OUTPUT_DIR"
_RUSTFLAGS="-C link-arg=-static-libgcc -C link-arg=-Wl,--dynamic-linker=/lib64/ld-linux-x86-64.so.2 -C link-arg=-Wl,-rpath,/lib/x86_64-linux-gnu -C link-arg=-Wl,-rpath,/lib64"
_COMMAND=(
  env
  "CARGO_HOME=${_CARGO_HOME}"
  "CARGO_TARGET_DIR=${_TARGET_DIR}"
  "RUSTFLAGS=${_RUSTFLAGS}"
  cargo build --locked --release --manifest-path "$_MANIFEST"
)

echo "[BoosterStateBuild] Building from Cargo.lock with pinned nixpkgs/Rust toolchain"
nix-shell "${_SCRIPT_DIR}/boosterstate-toolchain.nix" \
  -I "nixpkgs=${_PINNED_NIXPKGS}" \
  --run "$(printf '%q ' "${_COMMAND[@]}")"

_BINARY="${_TARGET_DIR}/release/boosterstate"
[[ -x "$_BINARY" ]] || {
  echo "[BoosterStateBuild] FATAL: build completed without executable ${_BINARY}" >&2
  exit 1
}
cp "$_BINARY" "${_OUTPUT_DIR}/boosterstate"
chmod 755 "${_OUTPUT_DIR}/boosterstate"
echo "[BoosterStateBuild] Ready: bin/boosterstate"