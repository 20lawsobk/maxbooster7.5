#!/usr/bin/env bash
# Max Booster — Download MaxMind GeoLite2 Database
#
# Downloads the GeoLite2-Country.mmdb database for GeoDNS support.
# No external API calls at query time — the database runs entirely locally.
#
# Requires:
#   MAXMIND_ACCOUNT_ID  — your MaxMind account ID (free at maxmind.com)
#   MAXMIND_LICENSE_KEY — your MaxMind license key (free, generated in account)
#
# Usage:
#   MAXMIND_ACCOUNT_ID=123456 MAXMIND_LICENSE_KEY=xxxx bash scripts/download-geodb.sh
#
# Or set the env vars in your environment and just run:
#   bash scripts/download-geodb.sh
#
# Sign up for a free account at: https://www.maxmind.com/en/geolite2/signup
# After signup: Services → My License Key → Generate New License Key
#
# Databases available:
#   GeoLite2-Country — country + continent (small, fast — recommended)
#   GeoLite2-City    — country + city + lat/lon (larger, ~60MB)
#   GeoLite2-ASN     — ISP + AS number

set -euo pipefail

ACCOUNT_ID="${MAXMIND_ACCOUNT_ID:-}"
LICENSE_KEY="${MAXMIND_LICENSE_KEY:-}"
EDITION="${MAXMIND_EDITION:-GeoLite2-Country}"
OUT_DIR="${GEODB_DIR:-$(pwd)/data}"
OUT_FILE="$OUT_DIR/$EDITION.mmdb"

# ── Validate inputs ───────────────────────────────────────────────────────────

if [[ -z "$ACCOUNT_ID" || -z "$LICENSE_KEY" ]]; then
  echo ""
  echo "❌  Missing MaxMind credentials."
  echo ""
  echo "  Sign up free at: https://www.maxmind.com/en/geolite2/signup"
  echo "  Then: Services → My License Key → Generate New License Key"
  echo ""
  echo "  Set environment variables and re-run:"
  echo "    export MAXMIND_ACCOUNT_ID=<your_account_id>"
  echo "    export MAXMIND_LICENSE_KEY=<your_license_key>"
  echo "    bash scripts/download-geodb.sh"
  echo ""
  exit 1
fi

# ── Create output directory ───────────────────────────────────────────────────

mkdir -p "$OUT_DIR"

# ── Download ──────────────────────────────────────────────────────────────────

DOWNLOAD_URL="https://download.maxmind.com/geoip/databases/${EDITION}/download?suffix=tar.gz"
TMPDIR=$(mktemp -d)
TMPTAR="$TMPDIR/$EDITION.tar.gz"

echo "⬇️  Downloading MaxMind ${EDITION} database..."
echo "   URL: $DOWNLOAD_URL"

if command -v curl &>/dev/null; then
  curl -fsSL \
    --user "${ACCOUNT_ID}:${LICENSE_KEY}" \
    -o "$TMPTAR" \
    "$DOWNLOAD_URL"
elif command -v wget &>/dev/null; then
  wget -q \
    --user="${ACCOUNT_ID}" \
    --password="${LICENSE_KEY}" \
    -O "$TMPTAR" \
    "$DOWNLOAD_URL"
else
  echo "❌  Neither curl nor wget found. Please install one."
  exit 1
fi

# ── Extract ───────────────────────────────────────────────────────────────────

echo "📦  Extracting..."
tar -xzf "$TMPTAR" -C "$TMPDIR"

# Find the .mmdb file inside the extracted directory
MMDB_FILE=$(find "$TMPDIR" -name "*.mmdb" | head -n 1)
if [[ -z "$MMDB_FILE" ]]; then
  echo "❌  Could not find .mmdb file in the downloaded archive."
  rm -rf "$TMPDIR"
  exit 1
fi

mv "$MMDB_FILE" "$OUT_FILE"
rm -rf "$TMPDIR"

# ── Report ────────────────────────────────────────────────────────────────────

SIZE=$(du -sh "$OUT_FILE" | cut -f1)
echo ""
echo "✅  MaxMind ${EDITION} database ready!"
echo "   File: $OUT_FILE"
echo "   Size: $SIZE"
echo ""
echo "Next steps:"
echo "  1. Set env vars in your deployment environment:"
echo "     GEODNS_ENABLED=true"
echo "     GEODB_PATH=$(realpath "$OUT_FILE")"
echo "     REGION_MAP={\"NA\":\"YOUR_US_IP\",\"EU\":\"YOUR_EU_IP\",\"AS\":\"YOUR_ASIA_IP\",\"default\":\"${DNS_SERVER_IP:-34.111.179.208}\"}"
echo ""
echo "  2. Restart the application."
echo ""
echo "  3. Set up a monthly cron job to keep the database fresh:"
echo "     0 3 1 * * bash $(realpath "$0")"
echo ""
