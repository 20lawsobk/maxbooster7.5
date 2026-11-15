# App Python network finding resolution

All assigned findings now use `server/services/secure_http.py`. The transport
accepts only HTTP(S), rejects credentials/fragments, pins each target to a
separately supplied trusted origin, validates all resolved addresses, connects
to the already-validated address (preventing DNS rebinding between validation
and connection), preserves TLS hostname verification, refuses every redirect,
and limits response size. Deployment-configured internal services opt in to
private addressing; the fixed V4 sidecar hop requires loopback specifically.

| Finding | Disposition and boundary |
|---|---|
| 32 | `poll_chart_topper.py`: fixed MaxCore origin; returned download URLs must remain same-origin. |
| 35 | `ai_content_sidecar.py`: MaxCore deployment origin pinned; bearer token cannot cross a redirect/origin. |
| 39 | `api_server_v4.py`: weight notification pinned to the configured MaxCore origin. |
| 40 | `api_server_v4.py`: video relay pinned to the configured MaxCore origin. |
| 41 | `api_server_v4.py`: model sync pinned to the configured MaxCore origin. |
| 42 | `api_server_v4.py`: generic proxy pinned to the configured MaxCore origin. |
| 43 | `dataset_reader.py`: peer is trusted deployment configuration; paths remain pinned to that explicit LAN origin. |
| 44 | `audio_synth_v2.py`: authenticated submit pinned to configured MaxCore origin. |
| 45 | `audio_synth_v2.py`: job polling pinned to configured MaxCore origin. |
| 46 | `audio_synth_v2.py`: response-controlled audio URL must match the MaxCore origin. |
| 47 | `ltx_adapter.py`: authenticated video submit pinned to configured MaxCore origin. |
| 48 | `ltx_adapter.py`: job polling pinned to configured MaxCore origin. |
| 49 | `ltx_adapter.py`: response-controlled video URL must match the MaxCore origin. |
| 50 | `maxcore_dataset_bridge.py`: authenticated GET pinned to configured MaxCore origin. |
| 51 | `maxcore_dataset_bridge.py`: authenticated POST pinned to configured MaxCore origin. |
| 54 | `corpus_bridge.py`: authenticated corpus POST pinned to configured MaxCore origin. |
| 55 | `corpus_bridge.py`: authenticated corpus GET pinned to configured MaxCore origin. |
| 56 | `training_bridge.py`: status call requires exact origin and loopback-only resolution. |
| 57 | `training_bridge.py`: simulator call requires exact origin and loopback-only resolution. |

Focused verification: `python3 -m unittest tests.test_secure_http` covers public
address rejection, strict loopback policy, pre-network origin mismatch
rejection, custom-scheme rejection, and redirect refusal. `py_compile` was run for the helper,
all modified callers, and the focused test. No scanner suppressions were added;
the prior dynamic `urllib` sinks were removed from every assigned call site.