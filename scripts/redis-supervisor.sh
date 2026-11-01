#!/usr/bin/env bash
# Lifecycle helper for a configured loopback Redis used by BullMQ. External
# Redis URLs are operator-owned and are never started, stopped, or rewritten.

_REDIS_SUPERVISOR_PID=""

_redis_supervisor_classify() {
  local node_bin="$1"
  "$node_bin" --input-type=module -e '
    const raw = process.env.REDIS_URL || process.env.NATIVE_REDIS_URL || "";
    if (!raw) {
      console.log("none");
      process.exit(0);
    }
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
      if (url.protocol !== "redis:" || !loopback) {
        console.log("external");
      } else {
        console.log(["local", url.port || "6379", url.username || url.password ? "auth" : "noauth"].join("\t"));
      }
    } catch {
      console.log("external");
    }
  '
}

_redis_supervisor_ping() {
  local port="$1"
  local reply=""
  exec 9<>"/dev/tcp/127.0.0.1/${port}" 2>/dev/null || return 1
  printf '*1\r\n$4\r\nPING\r\n' >&9
  IFS= read -r -t 1 reply <&9 || true
  exec 9>&-
  [[ "$reply" == "+PONG"$'\r' ]]
}

_redis_supervisor_find_binary() {
  local root="$1"
  local candidate=""
  for candidate in \
    "${REDIS_SERVER_BIN:-}" \
    "${root}/bin/redis-server" \
    "$(command -v redis-server 2>/dev/null || true)" \
    /home/runner/.nix-profile/bin/redis-server \
    /usr/local/bin/redis-server \
    /usr/bin/redis-server; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    printf '%s\n' "$candidate"
    return 0
  done
  for candidate in /nix/store/*-redis-*/bin/redis-server; do
    [[ -x "$candidate" ]] || continue
    printf '%s\n' "$candidate"
    return 0
  done
  return 1
}

redis_supervisor_start() {
  local node_bin="$1"
  local root="$2"
  local classification mode port auth redis_bin data_dir

  classification="$(_redis_supervisor_classify "$node_bin")" || return 1
  IFS=$'\t' read -r mode port auth <<<"$classification"
  if [[ "$mode" == "none" ]]; then
    echo "[RedisSupervisor] No native Redis URL configured; leaving queue backend selection unchanged"
    return 0
  fi
  if [[ "$mode" == "external" ]]; then
    echo "[RedisSupervisor] Operator-managed Redis configured; lifecycle left untouched"
    return 0
  fi
  if [[ "$auth" == "auth" ]]; then
    echo "[RedisSupervisor] FATAL: cannot safely bootstrap an authenticated loopback Redis; start the operator-managed instance first" >&2
    return 1
  fi
  if _redis_supervisor_ping "$port" 2>/dev/null; then
    echo "[RedisSupervisor] Loopback Redis already ready on 127.0.0.1:${port}; not owned by this launcher"
    return 0
  fi

  redis_bin="$(_redis_supervisor_find_binary "$root")" || {
    echo "[RedisSupervisor] FATAL: loopback Redis is configured on 127.0.0.1:${port}, but no executable redis-server was found (set REDIS_SERVER_BIN or package bin/redis-server)" >&2
    return 1
  }
  data_dir="${REDIS_DATA_DIR:-${root}/data/redis}"
  mkdir -p "$data_dir"
  chmod 700 "$data_dir"

  "$redis_bin" \
    --bind 127.0.0.1 \
    --protected-mode yes \
    --port "$port" \
    --dir "$data_dir" \
    --dbfilename dump.rdb \
    --appendonly yes \
    --appenddirname appendonlydir \
    --daemonize no &
  _REDIS_SUPERVISOR_PID=$!

  local attempt
  for attempt in {1..50}; do
    if _redis_supervisor_ping "$port" 2>/dev/null; then
      echo "[RedisSupervisor] Owned Redis ready on 127.0.0.1:${port} (pid ${_REDIS_SUPERVISOR_PID}, persistent dir ${data_dir})"
      return 0
    fi
    if ! kill -0 "$_REDIS_SUPERVISOR_PID" 2>/dev/null; then
      wait "$_REDIS_SUPERVISOR_PID" 2>/dev/null || true
      _REDIS_SUPERVISOR_PID=""
      echo "[RedisSupervisor] FATAL: redis-server exited before readiness on 127.0.0.1:${port}" >&2
      return 1
    fi
    sleep 0.1
  done

  redis_supervisor_cleanup
  echo "[RedisSupervisor] FATAL: redis-server did not answer PING on 127.0.0.1:${port} within 5 seconds" >&2
  return 1
}

redis_supervisor_cleanup() {
  local pid="${_REDIS_SUPERVISOR_PID:-}"
  [[ -n "$pid" ]] || return 0
  _REDIS_SUPERVISOR_PID=""
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    echo "[RedisSupervisor] Owned Redis stopped cleanly"
  fi
}