#!/usr/bin/env bash
# Compatibility entrypoint for older callers. Keep one implementation of the
# unpacked production start contract, including artifact validation.
set -Eeuo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd -- "$root"
exec npm run start
