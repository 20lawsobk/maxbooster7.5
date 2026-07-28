#!/usr/bin/env python3
"""
Resilient MaxCore audio-job poller with parallel keep-alive pings.

MaxCore auto-sleeps if it sees no traffic for ~45 s. We beat that by firing a
lightweight heartbeat every 2 s in a background thread while the job polls run
every 4 s in the main thread — keeping MaxCore active through the full render.

Usage:
  python3 scripts/poll_chart_topper.py [JOB_ID]

If JOB_ID is omitted a new chart-topper audio job is submitted first.
"""
import sys, os, time, json, base64, threading
import urllib.request, urllib.error

BASE   = "https://secure-ai-forge.replit.app"
KEY    = "mbs_283fb680fcfcfc1f83300442f4185712392c7c7c3d4868bbd925085ace25ec8e"
BUDGET = 30 * 60   # 30 min total poll budget (seconds)
OUT_DIR = "/home/runner/workspace/generated-content/audio"

PAYLOAD = {
    "genre":             "melodic trap",
    "mood":              "dark, cinematic, emotional",
    "tempo":             140,
    "key":               "F# minor",
    "duration":          30,
    "style":             "cinematic melodic trap — Drake, J. Cole, Metro Boomin production level",
    "elements":          ["orchestral strings", "haunting piano melody", "punchy 808s",
                          "rolling hi-hats", "layered synths", "choir pads"],
    "energy":            "builds from atmospheric intro to hard-hitting drop",
    "quality":           "chart-ready, streaming-optimized, radio-ready mix",
    "reference_artists": ["Drake", "J. Cole", "Metro Boomin", "Travis Scott"],
    "mix_notes":         "wide stereo field, heavy low-end, crisp hi-hats, warm mids",
}

# ── keep-alive state shared between threads ──────────────────────────────────
_keepalive_active = False
_keepalive_thread = None


def _send(method, path, payload=None, timeout=20):
    data = json.dumps(payload).encode() if payload else None
    req  = urllib.request.Request(
        f"{BASE}{path}", data=data,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return 0, b""


def _keepalive_loop():
    """Fire a GET /api/health every 2 s to prevent MaxCore auto-sleep."""
    while _keepalive_active:
        _send("GET", "/api/health", timeout=8)
        time.sleep(2)


def start_keepalive():
    global _keepalive_active, _keepalive_thread
    _keepalive_active = True
    _keepalive_thread = threading.Thread(target=_keepalive_loop, daemon=True)
    _keepalive_thread.start()
    print("  [keepalive] started (ping every 2 s)")


def stop_keepalive():
    global _keepalive_active
    _keepalive_active = False
    if _keepalive_thread:
        _keepalive_thread.join(timeout=4)
    print("  [keepalive] stopped")


# ── wait for MaxCore to be reachable ─────────────────────────────────────────
def wait_for_maxcore():
    print("Waiting for MaxCore to be reachable...")
    while True:
        code, body = _send("GET", "/api/health", timeout=15)
        if code == 200:
            try:
                d = json.loads(body)
                print(f"MaxCore online — status={d.get('status')} "
                      f"uptime={round(d.get('uptime_seconds', 0) / 60, 1)} min")
                return
            except Exception:
                pass
        print(f"  {time.strftime('%H:%M:%S')} HTTP {code} — retrying in 15 s...")
        time.sleep(15)


# ── submit ────────────────────────────────────────────────────────────────────
def submit_job():
    print("Submitting chart-topper audio job...")
    code, body = _send("POST", "/api/generate/audio", PAYLOAD, timeout=30)
    print(f"  HTTP {code}: {body[:200]}")
    if code != 200:
        return None
    try:
        d = json.loads(body)
        jid = d.get("job_id") or d.get("id")
        print(f"  job_id: {jid}")
        return jid
    except Exception:
        return None


# ── save audio ────────────────────────────────────────────────────────────────
def save_audio(job_data, job_id):
    os.makedirs(OUT_DIR, exist_ok=True)
    title = (job_data.get("concept") or job_data.get("style_hook") or
             job_data.get("title") or "chart-topper")
    safe  = "".join(c if c.isalnum() or c in "-_ " else "_" for c in title)[:50].strip()
    ts    = int(time.time())

    for field in ("wav_b64", "audio_b64", "audio_base64"):
        b64 = job_data.get(field)
        if b64:
            ext  = "wav" if "wav" in field else "mp3"
            path = f"{OUT_DIR}/{safe}_{ts}.{ext}"
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64))
            print(f"  Saved → {path} ({os.path.getsize(path):,} bytes)")
            return path

    for field in ("audio_url", "url", "output_url"):
        url = job_data.get(field, "")
        if url:
            if url.startswith("/"):
                url = BASE + url
            ext  = "mp3" if ".mp3" in url else "wav"
            path = f"{OUT_DIR}/{safe}_{ts}.{ext}"
            try:
                req = urllib.request.Request(
                    url, headers={"Authorization": f"Bearer {KEY}"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    with open(path, "wb") as f:
                        f.write(r.read())
                sz = os.path.getsize(path)
                print(f"  Downloaded → {path} ({sz:,} bytes)")
                return path
            except Exception as e:
                print(f"  Download error: {e}")

    print("  No audio field found. Keys:", list(job_data.keys()))
    return None


# ── poll ──────────────────────────────────────────────────────────────────────
def poll(job_id):
    deadline = time.time() + BUDGET
    empty_streak = 0
    start = time.time()

    print(f"\nPolling job {job_id}  (budget={BUDGET // 60} min, keepalive active)")
    start_keepalive()

    try:
        while time.time() < deadline:
            time.sleep(4)
            elapsed = int(time.time() - start)
            remain  = int(deadline - time.time())

            code, body = _send("GET", f"/api/audio-job/{job_id}", timeout=25)

            if code == 0:
                empty_streak += 1
                if empty_streak % 5 == 1:
                    print(f"  {elapsed:>4}s  HTTP 000 (MaxCore unreachable #{empty_streak}), "
                          f"{remain // 60}m{remain % 60}s remain")
                continue

            if code in (401, 403):
                print(f"  {elapsed:>4}s  HTTP {code} auth error — aborting")
                return None

            if code == 404:
                print(f"  {elapsed:>4}s  HTTP 404 — job record gone (server restarted)")
                return "EXPIRED"

            if code != 200:
                print(f"  {elapsed:>4}s  HTTP {code} — transient, continuing")
                empty_streak += 1
                continue

            empty_streak = 0

            if not body.strip():
                print(f"  {elapsed:>4}s  HTTP 200 empty body — continuing")
                continue

            try:
                d = json.loads(body)
            except Exception:
                print(f"  {elapsed:>4}s  non-JSON body — continuing")
                continue

            status = (d.get("status") or "").lower()
            print(f"  {elapsed:>4}s  status={status}")

            if status in ("error", "failed"):
                print(f"  Job failed: {d.get('error', '?')}")
                return None

            if (status in ("done", "completed", "complete") or
                    d.get("wav_b64") or d.get("audio_b64") or
                    d.get("url") or d.get("audio_url")):

                aa = d.get("audio_analysis", {})
                print(f"\n  ✅ Complete! elapsed={elapsed}s")
                print(f"  concept  : {d.get('concept', d.get('style_hook', d.get('title', '?')))}")
                print(f"  key      : {d.get('key', d.get('musical_key', '?'))}")
                print(f"  bpm      : {d.get('bpm', d.get('tempo', '?'))}")
                print(f"  loudness : {aa.get('loudness_db', '?')} dB")
                print(f"  energy   : {aa.get('energy', '?')}")
                print(f"  bass     : {aa.get('bass_weight', aa.get('bass', '?'))}")
                return d

    finally:
        stop_keepalive()

    print(f"\n  Budget exhausted ({BUDGET // 60} min)")
    return None


# ── main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    job_id = sys.argv[1] if len(sys.argv) > 1 else None

    wait_for_maxcore()

    if not job_id:
        job_id = submit_job()
        if not job_id:
            print("Failed to submit job")
            sys.exit(1)
    else:
        # Check if old job still alive; resubmit if expired
        code, body = _send("GET", f"/api/audio-job/{job_id}", timeout=12)
        if code == 404:
            print(f"Job {job_id} expired (404) — resubmitting")
            job_id = submit_job()
            if not job_id:
                print("Failed to resubmit")
                sys.exit(1)
        elif code == 200:
            try:
                st = json.loads(body).get("status", "?")
                print(f"Resuming existing job {job_id} status={st}")
            except Exception:
                pass

    result = poll(job_id)

    if result == "EXPIRED":
        # MaxCore restarted mid-render — resubmit immediately (we're still online)
        print("\nJob expired mid-poll — resubmitting immediately...")
        job_id = submit_job()
        if not job_id:
            print("Resubmit failed")
            sys.exit(1)
        result = poll(job_id)

    if not result or result == "EXPIRED":
        print("\nCould not complete audio generation.")
        sys.exit(1)

    path = save_audio(result, job_id)
    if path:
        print(f"\n🎵 Chart-topper saved: {path}")
    else:
        print("\nAudio data present but save failed.")
        print(json.dumps(result, indent=2)[:800])
