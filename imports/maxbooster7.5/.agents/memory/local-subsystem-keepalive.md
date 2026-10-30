
## Applied (Aug 2026)
- MaxCore api-server startKeepalive() is now opt-in via MAXCORE_KEEPALIVE=1; /api/system/readiness treats keepalive as non-required when disabled (relies on Python health + warm state), and getKeepaliveStatus reports enabled/disabledReason.
- CAVEAT found by review: disabling a keepalive loop can break a readiness endpoint that consumed its status snapshot — always grep for consumers of the keepalive status before gating it off.
- Other remote-era removals: maxcoreClient wake ping deleted (55s ping kept as local liveness monitor — it powers onReconnect), maxcoreSync sleeping-HTML guard + 3×15s wake retries removed, initial weight sync 120s→15s, waitForPdimReady 130s→20s.
