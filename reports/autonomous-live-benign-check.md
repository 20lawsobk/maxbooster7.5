# Benign authenticated live check — 2026-09-19

After the application health and CSRF endpoints became ready, one benign check used the normal CSRF-protected login through the development HTTPS proxy. Workspace credentials remained in the process environment; no credentials, cookies, tokens, or user response values were recorded.

| Check | Result |
|---|---|
| CSRF establishment | HTTP 200 JSON |
| Normal login | HTTP 200 JSON |
| `GET /api/auth/me` | HTTP 200 JSON object |
| `GET /api/auth/preferences` | HTTP 200 JSON object |
| `GET /api/dashboard/comprehensive` | HTTP 200 JSON object |

All three legitimate proxied authenticated GET requests passed their basic shape assertions and none returned HTTP 403. The new fail-closed blocklist did not block this normal authenticated flow.

No browser, attack simulation, account change, application-data write, or provider action was performed. The only state created was the normal login session.