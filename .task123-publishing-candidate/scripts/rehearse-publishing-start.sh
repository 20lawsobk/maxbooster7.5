#!/usr/bin/env bash
# Run only against a successful disposable publishing-rehearsal directory.
set -Eeuo pipefail
if [[ "${1:-}" == "--inner" ]]; then
  root=$2; run=$3; node=$4
  alias=$(mktemp -d /tmp/publishing-runtime.XXXXXX)
  mount --bind "$run" "$alias"
  mkdir -p "$alias/tools/node_modules"
  mount --bind "$root/node_modules" "$alias/tools/node_modules"
  mount -o remount,bind,ro "$alias/tools/node_modules"
  # Absolute paths in the application resolve to the disposable copy, never
  # the live checkout. All descendants also inherit the private network.
  mount --bind "$alias/app" "$root"
  ip link set lo up
  export HOME="$alias/home" TMPDIR="$alias/tmp"
  export XDG_CONFIG_HOME="$alias/config" XDG_CACHE_HOME="$alias/cache"
  export XDG_DATA_HOME="$alias/user-data" XDG_STATE_HOME="$alias/state"
  export PATH="$alias/tools/node_modules/.bin:$PATH"
  export NODE_PATH="$alias/tools/node_modules"
  export NODE_ENV=production PORT=5000
  export DATABASE_URL='postgresql://simulation@127.0.0.1:55432/postgres?sslmode=disable'
  export NEON_DATABASE_URL="$DATABASE_URL"
  export SESSION_SECRET='isolated-rehearsal-only-not-a-production-secret'
  export REPLIT_DEPLOYMENT=1
  pg="$alias/postgres"
  initdb -D "$pg" -U simulation --auth=trust --no-locale --encoding=UTF8 > "$alias/postgres-init.log" 2>&1
  cleanup() {
    [[ -z "${app_pid:-}" ]] || kill -- "-$app_pid" 2>/dev/null || true
    pg_ctl -D "$pg" -m immediate stop >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  pg_ctl -D "$pg" -l "$alias/postgres.log" -o "-h 127.0.0.1 -k $alias/tmp -p 55432" -w start
  cd "$root"
  "$node" "$alias/tools/node_modules/drizzle-kit/bin.cjs" push --force > "$alias/schema.log" 2>&1
  readlink /proc/self/ns/net > "$alias/runtime-network-namespace"
  setsid bash start.sh > "$alias/start.log" 2>&1 &
  app_pid=$!
  for ((i=0;i<180;i++)); do
    code=$(curl -s --max-time 2 -o "$alias/readiness.json" -w '%{http_code}' http://127.0.0.1:5000/api/ready || true)
    echo "readiness probe: $code" >> "$alias/probes.log"
    if [[ "$code" == 200 ]]; then
      echo "READINESS_HTTP_200" > "$alias/start-result"
      exit 0
    fi
    kill -0 "$app_pid" 2>/dev/null || { echo "START_EXITED" > "$alias/start-result"; exit 1; }
    sleep 3
  done
  echo "READINESS_NOT_REACHED" > "$alias/start-result"
  exit 1
fi
root=$(cd "$(dirname "$0")/.." && pwd)
name=${1:?Pass the disposable rehearsal directory name}
[[ "$name" =~ ^publishing-rehearsal-[a-zA-Z0-9]+$ ]] || exit 2
run="$root/.local/$name"
node=$(command -v node)
"$node" -e 'const s=require(process.argv[1]);if(s.stage!=="built"||s.code!==0)process.exit(1)' "$run/status.json"
cp "$0" "$run/start-rehearsal.sh"
readlink /proc/self/ns/net > "$run/host-network-namespace"
cd "$run/app"
# These restore commands only materialize files. The application starts later,
# with no external network and only a new local PostgreSQL database.
env -i PATH="$PATH" HOME="$run/home" "$node" dist/pdim-restore.mjs all > "$run/restore.log" 2>&1
env -i PATH="$PATH" HOME="$run/home" "$node" dist/deployment/restore-runtime-data.mjs > "$run/data-restore.log" 2>&1
tar --zstd -xf source.pdim
exec env -i PATH="$PATH" LANG=C \
  unshare --user --map-current-user --keep-caps --mount --net \
  timeout --kill-after=20s 660 bash "$run/start-rehearsal.sh" --inner "$root" "$run" "$node"
