# Deployment packing comparison — 2026-10-02

The comparison uses the real `packCapsule` implementation on hardlink snapshots
of all four workspace payloads: portable Python, node_modules, MaxCore and PDIM.
Original payloads and preserved simulation copies are not removed or modified.
Four jobs run concurrently with one zstd worker each, matching the latest
publishing log's four-CPU build allocation. Both settings retain `--long=27`.

| Setting | Measured stage time | Result |
| --- | ---: | --- |
| Previous zstd level 19 | More than 503 seconds | Still packing Python and node_modules when stopped |
| zstd level 6, including recovery snapshot creation | 221.228 seconds | All four archives completed |

This demonstrates a conservative speedup of **more than 2.27×** for this stage,
not a predicted wall time for the entire publishing process. The baseline was
deliberately stopped rather than waiting for a precise, longer completion time.
The dev app remained running in the same four-CPU environment; this was not an
isolated production builder.

The new archives total **1,242,500,162 bytes** (about 1.16 GiB):

- Python: about 380 MiB
- node_modules: about 182 MiB
- MaxCore: about 574 MiB
- PDIM: about 49 MiB

Each archive passed `zstd -t`. Focused tests additionally exercise the shipped
restore implementation, byte-identical round trips, exclusions, model hash
validation, and dependency-free recovery after SIGKILL at multiple pack stages.
The existing 7.5 GiB full-image safety gate remains unchanged; this archive
measurement is **not** a measurement of the full image including Nix.

Reproduce both runs with `npx tsx script/benchmark-capsule-packing.ts`, or only
the new setting with `--new-only`. The default complete comparison can take
considerably longer because it waits for level 19 to finish. Temporary copies
are kept under the image-excluded `.deployment-pack-state` directory and removed
afterward. Allow enough scratch space for a full recovery copy on filesystems
without reflink support.

No publish, GitHub push, database startup, or full build/restore/startup
simulation was performed by this benchmark.