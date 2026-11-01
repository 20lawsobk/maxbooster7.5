# Full generation-chain acceptance — blocked, not accepted

Requested scope: **request → awareness layers/systems → content-type script →
dedicated pipeline → storage → client**, for each live generation type.

## Actual browser observations

* Public application and normal login form rendered in the initial browser pass.
* The test notebook did not inherit workspace credentials. No bypass, invented
  connection, account creation or role/subscription change was used.
* A workspace-driven, loopback-only Chromium bridge submitted the normal login
  form using environment credentials without printing them. Its actual observed
  login response was **200**, with navigation to **`/dashboard`**.
* Before the authenticated generation pass could proceed, the workspace
  restarted and the tracked browser process was lost. The attempted navigation
  to social generation did not complete.
* A bounded bridge recovery reached Chromium again, but the application login
  form did not become available. A final app screenshot attempt failed with
  `ERR_CONNECTION_REFUSED` at port 5000.

The workflow's latest failure is specific:
`.replit exposes internal-only localPort 6379 on externalPort 3000`.
Earlier, the internal mappings were made private using the verified configuration
replacement mechanism; startup then passed its port checks and served the app.
After the restart, the public sidecar mappings had returned (6379, 8090, 9878,
9879), and the application failed closed again. The security check was not
weakened or bypassed. No further restart loop was attempted.

## Acceptance matrix

| Live client flow | Request through generation | Awareness/script/pipeline attribution | Storage save/retrieve | Client output/reload/play |
|---|---|---|---|---|
| Social text | NOT REACHED | NOT REACHED | NOT REACHED | NOT REACHED |
| Social image | NOT REACHED | NOT REACHED | NOT REACHED | NOT REACHED |
| Social audio | NOT REACHED | NOT REACHED | NOT REACHED | NOT REACHED |
| Social video | NOT REACHED | NOT REACHED | NOT REACHED | NOT REACHED |
| Advertising and campaign drafts | NOT REACHED | NOT REACHED | NOT REACHED | NOT REACHED |
| Studio melody/drums/chords | NOT REACHED | NOT REACHED | NOT REACHED | NOT REACHED |
| Distribution Music Videos | NOT REACHED | NOT REACHED | NOT REACHED | NOT REACHED |

These are prerequisite-blocked tests, **not failed generation requests**.
Normal login is the only authenticated browser operation established.
No external publishing, scheduling, email sending, distribution submission or
existing-user content edits were performed by the evaluation.

## Separate diagnostic evidence

[Dedicated type results](DEDICATED-TYPES.md) cover 21 in-process scenarios plus
eight targeted corrections. Their actual outputs are retained. They do not
establish this matrix: local render/job files are not proof of PDIM durability,
and invoking a handler directly is not proof of client request wiring.

The initial WAV and video diagnostics were blocked by the evaluator's
protection of an existing advisory lock. Corrected trials isolate job metadata
only and retain actual generator, GPU and awareness implementations. Original
blocked records remain intact. The first five original trials also missed
pre-existing executor-thread profiling; corrected trials use all-thread
observation. Corpus/awareness freshness and cross-thread bitwise replay are
not established.

**Task remains incomplete for the expanded end-to-end scope.** Resume the same
acceptance plan after stable application startup and browser access are restored;
do not substitute the generator-only results for storage/client acceptance.