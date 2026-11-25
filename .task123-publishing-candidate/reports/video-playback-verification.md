# AI video playback verification

## Finding

The generated advertising video is valid and decodes successfully outside the
remote tester browser. The failure is a browser capability limitation, not a
render, storage-byte, HTTP MIME, or range-response defect. No transcode or
second render is warranted.

## Evidence

The existing generated asset was inspected without creating another render:

- Size: `1,313,286` bytes
- Container: MP4/MOV, `probe_score=100`
- Duration: `10.000000` seconds
- Video: H.264/AVC (`avc1`), Constrained Baseline, `1920x1080`,
  `yuv420p`, 24 fps, 240 frames
- Audio: AAC-LC (`mp4a`), stereo, 44.1 kHz, 10 seconds
- `moov` atom is at the beginning of the file (fast-start layout)
- `ffmpeg -v error -i <asset> -map 0:v:0 -f null -` exited `0`
- `ffmpeg -v error -i <asset> -map 0:a:0 -f null -` exited `0`

An installed local Chromium probe against this exact asset reported:

- `canPlayType("video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\"")`:
  `probably`
- Native metadata load: `readyState=4`, `duration=10`, `videoWidth=1920`,
  `videoHeight=1080`, with no media error

The remote tester received HTTP `200`, `Content-Type: video/mp4`, and the
expected `1,313,286` bytes. However, that browser reported an empty result for
`canPlayType("video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\"")`; loading the
fetched `Blob` then produced native media error `4` with `readyState=0`.
This directly establishes that the tester browser does not advertise support
for the otherwise valid H.264/AAC MP4.

## Serving-path review

The advertising route submits to the MaxCore renderer, validates the returned
video bytes, stores them as `video/mp4` in hybrid/PDIM storage, and returns the
same-origin hybrid storage URL. The hybrid media route:

- derives `Content-Type` from stored metadata (`video/mp4` for this asset;
  extension mapping also covers `.mp4`)
- sets `Content-Length`
- advertises `Accept-Ranges: bytes`
- returns `206` plus a bounded `Content-Range` for valid byte ranges
- returns the complete file for an ordinary `200` request

The route buffers the object before slicing a range, which affects memory and
latency but does not alter the media bytes or explain a codec-support error.

## Decision

No application playback fix, codec substitution, or hiding of the media error
was made. The honest UI fallback is appropriate for a browser that cannot
decode H.264/AAC. A future fix would need to target the tester/browser runtime
(for example, enabling the required native codecs), not the generated asset or
storage response.