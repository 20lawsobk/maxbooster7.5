---
name: CSRF double-submit pattern in curl tests
description: How to correctly pass CSRF tokens when testing this app from curl
---

# CSRF token pattern for curl-based testing

## The rule
The app uses the double-submit cookie pattern. There is no `/api/auth/csrf` endpoint (returns 404). The CSRF token is the **value of the `csrf-token` cookie** — extract it from the cookie jar and pass it as the `X-CSRF-Token` header.

**Why:** The middleware validates that the `X-CSRF-Token` header matches the `csrf-token` cookie. `GET /api/csrf-token` is the existing endpoint that returns the middleware token; `GET /api/auth/csrf` does not exist and returns 404.

**Login and protected POSTs:** Do not assume `POST /api/auth/login` is CSRF-exempt. On 2026-09-30, a normal login POST without a CSRF cookie was rejected with HTTP 403 before credential validation. Calling `GET /api/csrf-token` first, then sending its cookie value as `X-CSRF-Token`, allowed the normal login flow; `/api/auth/me` then confirmed the session.

**Why:** The live middleware behavior contradicted the older exemption assumption. A 403 in this case is a CSRF rejection, not evidence that credentials are invalid.

**How to apply:** For curl-based session tests, call `GET /api/csrf-token` before login and before other state-changing requests. Use the `csrf-token` cookie value as the header, and keep the cookie jar on every request. Do not retry login with credentials until the CSRF preflight is correct.

**How to apply in curl:**
```bash
JAR=$(mktemp)
# 1. Acquire the CSRF cookie/token before login
curl -s -c "$JAR" -b "$JAR" http://127.0.0.1:5000/api/csrf-token > /dev/null
TOKEN=$(grep "csrf-token" "$JAR" | awk '{print $7}')

# 2. Login through the normal session endpoint
curl -s -c "$JAR" -b "$JAR" -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $TOKEN" \
  -d '{"email":"...","password":"..."}' > /dev/null

# 3. Use the token as both a cookie (via -b) and a header
TOKEN=$(grep "csrf-token" "$JAR" | awk '{print $7}')

curl -s -b "$JAR" -X POST http://127.0.0.1:5000/api/admin/... \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $TOKEN" \
  -d '{}'
```
