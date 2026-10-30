# Live Production Verification Runbook

**Purpose:** Verify the platform against the REAL deployment (Replit),
not the container. Container tests prove the code *can* work;
these prove it *does* work.

**Prerequisites:**
- Production URL (e.g. `https://maxbooster.replit.app`)
- Deployed commit SHA (from `/version` endpoint)
- Admin API key for authenticated checks

---

## 1. Transport Security

```bash
# TLS rating (must be A or A+)
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=maxbooster.replit.app

# Security headers (must be A or A+)
# Visit: https://securityheaders.com/?q=https://maxbooster.replit.app

# Required headers (verify via curl):
curl -sI https://maxbooster.replit.app | grep -iE "strict-transport|content-security|x-content-type|x-frame|referrer|permissions"

# No HTTP fallback:
curl -sI http://maxbooster.replit.app | head -1
# Must return: HTTP/1.1 301 (redirect to HTTPS)
```

**Pass criteria:** SSL Labs A+, securityheaders.com A+, all headers present, HTTP→HTTPS redirect.

## 2. Health & Dependencies (Live)

```bash
# Basic health:
curl -s https://maxbooster.replit.app/health | python3 -m json.tool

# Must return per-dependency status:
# {"status":"ok","postgres":"ok","redis":"ok","pdim":"ok","version":"<sha>"}

# Deep health (real DB read + Redis PING with latency):
curl -s https://maxbooster.replit.app/health/deep | python3 -m json.tool

# Version matches deployed SHA:
curl -s https://maxbooster.replit.app/version
```

**Pass criteria:** All dependencies report "ok", latencies <100ms, SHA matches.

## 3. Auth Flows (Live, End-to-End)

Manual test script:
1. POST `/api/auth/signup` → 201, verification email sent
2. Verify email → GET verification link → 200
3. POST `/api/auth/signin` → 200, JWT returned
4. GET `/api/user/me` with JWT → 200, correct user data
5. GET `/api/user/me` without JWT → 401 (not 500, not redirect)
6. GET `/api/user/<other-user-id>` → 403 (tenant isolation)
7. POST `/api/auth/signout` → 200
8. GET `/api/user/me` with old JWT → 401 (token invalidated)

**Pass criteria:** All 8 steps behave as specified.

## 4. Rate Limiting (Live)

```bash
# Fire 70 rapid requests at login (limit is 60/min):
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://maxbooster.replit.app/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' &
done | sort | uniq -c
# Must show: ~60 x 401, ~10 x 429 with Retry-After header
```

**Pass criteria:** 429s appear after limit, `Retry-After` header present.

## 5. Data Durability

```bash
# Neon PITR: verify point-in-time recovery window in Neon dashboard
# Must be: 7-30 days

# Last restore test: check runbook for date
# Must be: within last 90 days, restore to isolated target, app booted
```

**Pass criteria:** PITR enabled, restore tested <90d ago, RPO/RTO documented.

## 6. Deployment Verification Report

After all checks pass, generate:
- TLS grade screenshot (dated)
- Header scan output (dated)
- Health probe transcripts (with commit SHA)
- Backup restore log (with RPO/RTO)
- Auth flow test log

All artifacts must reference the same deployed commit SHA.
