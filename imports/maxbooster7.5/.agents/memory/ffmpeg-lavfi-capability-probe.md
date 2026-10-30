---
name: fluent-ffmpeg lavfi false-rejection
description: fluent-ffmpeg's capability probe only parses `ffmpeg -formats`, so modern ffmpeg builds that list lavfi only under `-devices` get wrongly rejected; use a raw PCM /dev/zero input for silence instead of -f lavfi anullsrc.
---

fluent-ffmpeg pre-checks whether a format is usable by parsing the output of
`ffmpeg -formats` once at startup/first-use. Modern ffmpeg builds (7.x+,
including this project's bundled `ffmpeg-static`) list `lavfi` only under
`ffmpeg -devices`, not `-formats` — so fluent-ffmpeg's probe concludes lavfi
is unavailable and refuses to run any `.input("anullsrc").inputFormat("lavfi")`
(or equivalent) command, even though the real ffmpeg binary fully supports it.

**Why:** this caused silent, always-failing silence generation for an "empty
track" export path, first mis-diagnosed as a missing/broken ffmpeg binary
rather than a wrapper-library capability-detection gap. Confirmed the real
binary (both system ffmpeg and the bundled ffmpeg-static) runs the equivalent
raw command fine in isolation — the gap is purely in fluent-ffmpeg's JS-side
pre-check, not the binary.

**How to apply:** for generating exact digital silence (or any lavfi virtual
source) through fluent-ffmpeg, don't rely on `-f lavfi`. Instead pipe raw
zeroed PCM from `/dev/zero` with `.input("/dev/zero").inputFormat("s16le")`
plus explicit `-ar`/`-ac` input options — the raw PCM demuxer is a
universally-listed core format so the capability probe never rejects it, and
a stream of zero bytes is bit-exact digital silence.
