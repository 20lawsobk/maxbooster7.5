---
name: CSRF double-submit pattern in curl tests
description: How to correctly pass CSRF tokens when testing this app from curl
---

# CSRF token pattern for curl-based testing

## The rule
The app uses the double-submit cookie pattern. There is no `/api/auth/csrf` endpoint (returns 404). The CSRF token is the **value of the `csrf-token` cookie** — extract it from the cookie jar and pass it as the `X-CSRF-Token` header.

**Why:** The middleware validates that the `X-CSRF-Token` header matches the `csrf-token` cookie. The cookie is set automatically on login. A GET to `/api/auth/csrf` doesn't exist and returns 404.

**Which routes are exempt:** `demo`, `login`, and `register` are the only CSRF-exempt auth POSTs (including temp dev-only test-login routes mirroring the demo pattern). Every other non-exempt POST — including from a curl session that already has a cookie jar — needs a real token: `GET /api/csrf-token` first (a real, existing endpoint — distinct from the nonexistent `/api/auth/csrf` above), which reuses and returns the same token the CSRF middleware already issued (see csrf-token-endpoint-must-reuse-middleware-token.md), then pass that value as `X-CSRF-Token`.

**How to apply in curl:**
```bash
JAR=$(mktemp)
# 1. Login to set the csrf-token cookie
curl -s -c "$JAR" -b "$JAR" -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}' > /dev/null

# 2. Extract token from cookie jar
TOKEN=$(grep "csrf-token" "$JAR" | awk '{print $7}')

# 3. Use it as both a cookie (via -b) and a header
curl -s -b "$JAR" -X POST http://127.0.0.1:5000/api/admin/... \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $TOKEN" \
  -d '{}'
```
