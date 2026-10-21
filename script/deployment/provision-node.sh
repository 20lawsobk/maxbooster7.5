#!/usr/bin/env bash
# Provision the portable runtime before dependencies exist. Fail closed before
# replacing a working binary; archives are never piped directly into extraction.
set -Eeuo pipefail
version=$(sed -n 's/^export const PORTABLE_NODE_VERSION = "\([0-9.]*\)";$/\1/p' script/lib/portableNodePolicy.mjs)
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid portable Node version policy' >&2; exit 1; }
archive="node-v${version}-linux-x64.tar.xz"
base="https://nodejs.org/dist/v${version}"
scratch=$(mktemp -d /tmp/maxbooster-node.XXXXXX)
trap 'rm -rf -- "$scratch"' EXIT
for file in "$archive" SHASUMS256.txt; do
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 180 --retry 2 "$base/$file" -o "$scratch/$file"
done
expected=$(awk -v name="$archive" '$2 == name { print $1 }' "$scratch/SHASUMS256.txt")
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || { echo 'Missing or ambiguous Node archive checksum' >&2; exit 1; }
printf '%s  %s\n' "$expected" "$scratch/$archive" | sha256sum --check --status || {
  echo 'Node archive checksum mismatch' >&2; exit 1;
}
tar -xJf "$scratch/$archive" --strip-components=2 -C "$scratch" "node-v${version}-linux-x64/bin/node"
chmod 755 "$scratch/node"
actual=$("$scratch/node" --version)
[ "$actual" = "v$version" ] || { echo 'Portable Node version mismatch' >&2; exit 1; }
mkdir -p .node_bin
mv "$scratch/node" .node_bin/node
printf '{"version":"%s","platform":"linux-x64","archiveSha256":"%s"}\n' "$version" "$expected" > .node_bin/provenance.json
echo "Verified portable Node $actual"
