# Content-output failure boundaries

## Scope and evidence

Targeted regression testing covers text shaping and dedicated image, audio, and
video production. This is not an exhaustive security review, high-load benchmark,
or certification of learned generation quality.

The initial adversarial suite reproduced 38 failing cases out of 44. After fixes
and additional output checks, the combined regression run passed 125 cases with
no failures or skips. Reports are in workspace-root
generated-artifacts/content-breakpoints-before and
generated-artifacts/content-breakpoints-after.

## Repaired boundaries

| Output | Weakness | Protection |
|---|---|---|
| Text | Unbroken strings and ellipsis could exceed caption limits | Reserve ellipsis space; handle zero/tiny limits; test Unicode and long tokens |
| Image | Malformed controls and seeds reached renderer internals | Explicit text, enum, seed and Unicode validation before rendering |
| Image | Supplied pixel arrays had no aggregate size bound | Maximum 4096 × 4096 source pixels, checked before image rendering |
| Audio | Individually allowed duration/rate combinations could create excessive work | Maximum 5,292,000 sample frames per dedicated render |
| Audio | Malformed musical controls raised incidental type errors | Validate key, genre, mood, instrument and arrangement before synthesis |
| Audio | Non-finite samples could be encoded as misleading output | Reject before writing WAV bytes |
| Audio | A valid WAV container could contain only silence or constant DC | Decode all PCM frames and require signal variation |
| Video | Individually valid dimensions/duration/FPS could multiply into excessive work | Maximum 3,732,480,000 pixel-frames per dedicated render |
| Video | Invalid text/colors/FPS could reach encoding | Validate scalar and storyboard controls before rendering |
| Video | Capability metadata omitted supported storyboards | Advertise single-scene and 2–8-scene storyboard modes with their actual limits |
| Shared | Huge integers escaped numeric validation via OverflowError | Convert overflow into a clear validation error |

Budgets reject excessive requests explicitly; they do not silently shorten
content, lower resolution, or reduce sample rate. These are workload ceilings,
not measured latency or concurrency guarantees. Existing UI ranges fit them.

Real-render regression tests cover poster decoding, instrumental WAV decoding,
multiple video frame rates, and storyboard frame counts. HTTP contract tests,
snapshot tests and measured-tempo tests remain part of the verification set.
Mocks in boundary tests only assert that invalid requests never enter costly
rendering; they are not evidence of generated-content quality.
