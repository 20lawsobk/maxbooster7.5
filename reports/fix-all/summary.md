# Fix-All Summary

Generated: 2026-08-02T20:54:36.411Z

- **ts-server** — applied (2026-08-02T20:50:53.930Z): native fixed=0 skipped=315; external=fix-ts2551-rename-back.mjs,fix-ts2769.mjs,fix-ts2345.mjs,fix-ts2339-cast.mjs; syntax-restored=1
- **verify-server** — measured (2026-08-02T20:52:32.221Z): 2375 → 2352 errors (parser: 0); top: TS2322:480 TS2769:354 TS2345:290 TS2339:223 TS6133:178 TS2365:95 TS2353:72 TS18046:63 TS2305:62 TS2571:59
- **imports** — applied (2026-08-02T20:50:54.222Z): rewritten=31 ambiguous=5 (bare-module diags left to policy) syntax-restored=0
- **schema** — applied (2026-08-02T20:50:54.997Z): pairs=146 inDb=0 removedWriteKeys=66 latentReads=185 syntax-restored=3
- **runtime** — passed (2026-08-02T20:54:36.307Z): /api/ready:200 /:200 /api/auth/user:404
- **audit** — measured (2026-08-02T20:53:19.906Z): critical=0 high=3 moderate=7 low=0 (report-only; installs are managed manually in this repo)
- **lint** — measured (2026-08-02T20:53:51.730Z): errors=921; top rules: no-unsafe-optional-chaining:451 no-division-by-zero/no-division-by-zero:393 @typescript-eslint/no-non-null-asserted-optional-chain:50 @typescript-eslint/no-unused-expressions:24 no-dupe-else-if:1 no-self-assign:1 no-script-url:1

TypeScript server: **2352 errors** (parser: 0) as of 2026-08-02T20:52:32.220Z
TypeScript client: not yet measured

OUTSTANDING WORK REMAINS — 2 categories are not clean. This pipeline does not claim success until they are.