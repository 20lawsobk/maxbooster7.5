# MaxCore network finding resolution

Baseline: `sast-resumed-full.json` (finding indices are 1-based).

| Index | Resolution |
|---:|---|
| 8 | Local load harness now requires a loopback origin and uses the same-origin transport, which rejects redirects before an API key can be forwarded. |
| 9 | Removed the separate dynamic HEAD opener; unknown public metadata conservatively selects the bounded safe streaming path. |
| 10 | Range downloads now use `safe_http` DNS validation, address pinning, redirect revalidation, byte limits, and deadlines. |
| 11 | Sequential/resumed downloads now use the same bounded `safe_http` transport. |
| 12 | URL metadata extraction uses bounded `safe_http.fetch_bytes`. |
| 13 | Page-title retrieval uses bounded, HTML-only `safe_http.fetch_bytes`. |
| 14 | Storage exec validates its configured origin, disables urllib3 redirects, and uses the same-origin transport fallback. |
| 15 | Storage ping has the same configured-origin and no-redirect guarantees. |
| 16 | Audio integration HTTP is hardcoded loopback and uses the no-redirect same-origin transport. |
| 17 | Audio artifact retrieval is constrained to that same loopback origin. |
| 18 | Awareness integration HTTP requires loopback and rejects redirects. |
| 21 | Removed dynamic code execution. Scene functions are imported normally; heavyweight server contracts are checked through parsed production AST. |
| 22 | Smoke-load HTTP is fixed to loopback and uses the no-redirect same-origin transport. |
| 24 | SHA-1 remediation is owned by the separate hash worker; this change set intentionally did not touch line 79. |
| 25 | Public data pulls use bounded `safe_http.fetch_bytes`. |
| 26 | Quality harvesting uses bounded `safe_http.fetch_bytes`. |
| 27 | Dataset seeding and availability probes use bounded `safe_http.fetch_bytes`. |

`safe_http` continues to accept only public HTTP(S), validates every DNS answer,
pins the validated address for each connection, and repeats validation after
each redirect. The added trusted transport deliberately preserves required
private/local configured endpoints while binding requests to one explicit
origin and refusing all redirects, so authorization headers cannot cross an
origin boundary.

Offline evidence: `tests/test_trusted_http.py` uses a mocked connection to prove
loopback enforcement, exact-origin enforcement, and redirect rejection without
following the attacker-controlled Location. Existing safe HTTP tests cover
private-address rejection, DNS pinning, redirect revalidation, and byte limits.