---
name: MaxCore reachability vs no-data distinction
description: Why returning bare `null` from MaxCore fetchers causes false "unreachable" logs, and the return-shape contract that fixes it.
---

## The rule

Any MaxCore fetcher whose null result is interpreted as "unreachable" by its caller MUST return a discriminated shape that separates _network failure_ from _reached-but-no-data_. The minimum shape is `{ value: T | null, reachable: boolean }`.

## Why

The ScoreCalibrator logged "MaxCore unreachable and no local data" while another line in the _same millisecond, same pid_ said "MaxCore connected — 4/4 models ready". Root cause: `fetchMaxCoreCalibration()` returned bare `null` when MaxCore was reached but the models had no training data and no live content signals — three different return-null paths all collapsed to the same falsy value, and the caller assumed null ⇒ unreachable.

This kind of false alarm erodes trust in the logs: the user knows MaxCore is up, so they stop believing the calibrator's diagnostics for everything else too.

## How to apply

- A fetcher is "reachable" if **any** sub-call produced a parsed response (even an empty/initialised state). Network failure / DNS error / total timeout is the only case where `reachable=false`.
- Callers must log accurately for both branches:
  - `!reachable` → "MaxCore unreachable …"
  - `reachable && !value` → "MaxCore reachable but no calibration data yet …"
- The only place `reachable=false` should be returned is the outer `catch` that wraps the network calls. All in-function early returns (no models ready, empty merged weights, etc.) must preserve the `reachable` flag computed from the parsed responses.
- When you add a new MaxCore fetcher, mirror this contract so callers never have to guess what `null` means.
