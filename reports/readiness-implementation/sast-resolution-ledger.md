# SAST baseline resolution ledger

## Final verification

`sast-final-verified.json` / `.md`: complete full scan of 3,236 source paths,
zero omissions and zero scanner errors. Nine raw findings remain visible:
two constrained static-code execution findings, six fixed-loopback HTTP
findings, and the hardened PostgreSQL argv execution finding. The last is
remediated in source but still matches the generic child-process rule.
No rule suppression, exclusion, or fabricated zero-finding result was used.

Focused verification: 34 Python tests plus 6 subtests, 5 subprocess/build
tests, and 9 scanner-runner tests passed. Server and client typechecks passed.
The scan snapshot preceded only a test assertion update from tuple shape to
TrustedOrigin fields; production corrections were included. That test change
passed its focused execution. Production readiness remains separately blocked.

Baseline: `sast-resumed-full.json`: 58 zero-based raw findings, 71 errors. Mapped by fingerprint/path/line, not report indices. This ledger update did not run a scan or change a suppression/gate.

**Baseline source-evidence safe dispositions: 58/58** (50 remediated + 8 reviewed-safe); **0 unresolved**. This does not rewrite the immutable baseline or mean its raw finding count is zero: the baseline still contains 58 findings. `sast-remediated-full.json` is a historical 2026-09-23T00:49:55.094Z 0-error/12-finding snapshot before current network/runtime corrections, not current verification.

Evidence profiles: **R** `sast-runtime-resolution.md` exact-fingerprint remediation/trust review and focused evidence; **M** `sast-maxcore-network-resolution.md` path/line-mapped bounded transport and offline HTTP evidence; **C** current source/diff fixed-loopback `trusted_http` replacement, no final result claimed; **N** `sast-node-resolution.md` loopback trust/subprocess controls and focused evidence; **A** `sast-app-network-resolution.md` path/line-mapped pinned-origin, TLS-verified, no-redirect bounded transport and focused unit/compile evidence.

|#|Fingerprint|Rule|Baseline path:line|Disposition|Evidence|
|---:|---|---|---|---|---|
|0|`758ebc077b346ecc6faef92a8d120f91d535f254f5796ded028544ffe47c5b8f`|`python.lang.security.deserialization.pickle.avoid-pickle`|`external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_creative_transformer.py:95`|remediated|R|
|1|`c906f78c0e19ca377bd03fdbe53a9305b8d99895d21ce747ac5882dea2ac061e`|`python.lang.security.deserialization.pickle.avoid-pickle`|`external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_creative_transformer.py:113`|remediated|R|
|2|`6f9fbaaef58f0276d372482511544c8293df14cd9e448684d7a63d67d453ed32`|`python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1`|`external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/compiler.py:109`|remediated|R|
|3|`6118a5c4593733d0c876cff988cc90ceb2d7ea0b445c0ece7830c39410e71fa7`|`python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1`|`external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/nvcc.py:189`|remediated|R|
|4|`bbf5c00908082752e8188ee6e4392438872435735b55b5a048994b3e48ac5b9a`|`python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1`|`external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/prototype.py:38`|remediated|R|
|5|`8fe7fbed1f2c204124c944ca44ed0248328de5d65e8934998bf00acca149b38d`|`python.lang.security.audit.exec-detected.exec-detected`|`external/maxcore/artifacts/ai-training-server/ai_model/isolated_audio_worker.py:36`|reviewed-safe|R|
|6|`3731c400624f81b666f3a3231a69889aeda7c3f4ab94c03dc2c43356b52d42a3`|`python.lang.security.deserialization.pickle.avoid-pickle`|`external/maxcore/artifacts/ai-training-server/ai_model/maxcore/runtime/process_pool.py:322`|remediated|R|
|7|`158500f85ba95a4e6707def02119e737ae763d5fc42b5c5ea18ad73a4428648c`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/endpoint_load_test.py:89`|remediated|R|
|8|`d7b7db0a7d1bcf89eafb9344ba15e9a2c45c034e0fb9dd11d85e6d983a99f42e`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/download_datasets.py:233`|remediated|M|
|9|`ac7e9e3ee66e8264c7c85500acac59280813d9806ab61c79507fe0799307abbc`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/download_datasets.py:256`|remediated|M|
|10|`7cc1bec3a2c87221a46ac7bbb53173cc5a2715002e143849778da0bc70f4eff2`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/download_datasets.py:327`|remediated|M|
|11|`fe0bc585b005794358da5b19b513171cf9fb5e7515f1ab98884a1a2e533720f7`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/url/extractor.py:136`|remediated|M|
|12|`7570f8d5241423aa712ebb189757fea13c61dfeabb3d85f60f235676847d9dc9`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/server.py:3873`|remediated|M|
|13|`ad0e467ea57f9485805ebc3d609cc0531b07eff2b8616fd391c9ca3dae54fc1f`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/storage_client.py:277`|remediated|M|
|14|`3d87af2fc46de29c2a814c751b11cf9e3e0636aab49cf6eb542822b27bc591c7`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/storage_client.py:360`|remediated|M|
|15|`5e8a428710124a75c61532d3e115b0cdf22d1e55f14a89adf9fcdced4139fab5`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py:55`|remediated|M|
|16|`57090eb6642717e4c9bf8694eac23bf67b34b6d276291afff71cdd903036e8eb`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py:365`|remediated|M|
|17|`a2a960f50c3e6804041e0d1c6f53681a1abf70a5c5e5f4b37619ab6712b46fdf`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/tests/test_awareness_and_quality.py:52`|remediated|M|
|18|`21f770ed67369536fc076df4980207d44f5e3f41bd23d5d4470e166609fe2842`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/tests/test_content_endpoints.py:41`|remediated|C|
|19|`d9e6443dcaebcf4f51a01c7401ec5d1e0c9dd078f584659ebd7e2a0ef9c05b7f`|`python.lang.security.audit.exec-detected.exec-detected`|`external/maxcore/artifacts/ai-training-server/tests/test_isolated_audio.py:59`|reviewed-safe|R|
|20|`cfd7009daa5c960601eb6d7bd010499c968302fa9016ed6f9c68558d497632f3`|`python.lang.security.audit.exec-detected.exec-detected`|`external/maxcore/artifacts/ai-training-server/tests/test_media_delivery_contract.py:30`|remediated|M|
|21|`b4d7a313dd498255e7617b6012b510e3c619a7e677efb75c6d6665d4beec5e06`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/tests/test_smoke_load.py:131`|remediated|M|
|22|`216dcacc41f0fd7d9d2e06307f0da5d37ebefd8667925f11d47f554ac1decbd7`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/tests/test_veo_parity.py:26`|remediated|C|
|23|`1e7f1a40cb4460ea0a39f9a71804bfc813b64a4d6c85a14b16c67033e1e0ebbc`|`python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1`|`external/maxcore/artifacts/ai-training-server/workers/data_puller.py:79`|remediated|R|
|24|`43f1bbd7ef703ca6bd797c85479ab1ad8d52832d2ba67346ca517a6541907fe3`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/workers/data_puller.py:502`|remediated|M|
|25|`46f7dda1dc9038ba8cad377aa3d5618ddf4de0b5952649011f5256ef5a7f8d0f`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/workers/quality_harvester.py:77`|remediated|M|
|26|`ec7e7985a451fe9c830db9facbd975e659c539bcdf35334a270e110c06d35783`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/workers/seed_audio_dataset.py:142`|remediated|M|
|27|`1ecaafa3227343ea5f1d28c0b1b8be9a46b296502f84fd652aa226bfa97f0d64`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`external/maxcore/artifacts/ai-training-server/workers/seed_audio_dataset.py:160`|remediated|M|
|28|`f30118ea3c907689a2bf66902bbf8594d830247227fac3007375337dd1765bc9`|`typescript.react.security.react-insecure-request.react-insecure-request`|`external/pdim/.replit_integration_files/server/replit_integrations/object_storage/objectStorage.ts:278`|reviewed-safe|N|
|29|`1fc962991850f41d84156ee7682ba71b3f1fd3ecea732996aa8b6c2ecc7fa0d5`|`typescript.react.security.react-insecure-request.react-insecure-request`|`external/pdim/artifacts/api-server/src/pocket-dimension/fabric/storage/ReplitChunkStore.ts:24`|reviewed-safe|N|
|30|`79090c49c64525055d857e13cbf62228769ef51f7949307dfa0b3b57fe778f18`|`typescript.react.security.react-insecure-request.react-insecure-request`|`external/pdim/artifacts/api-server/src/services/hybridStorageService.ts:88`|reviewed-safe|N|
|31|`717cb9d17c18b9ae60b0e614c107d92e2ace9443d60dded5244c64515579f294`|`typescript.react.security.react-insecure-request.react-insecure-request`|`external/pdim/artifacts/api-server/src/services/storageService.ts:122`|reviewed-safe|N|
|32|`b63a1593fee8c33fe9ba689bdb8fe471815cf22b48b942042433d6947efd1161`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`scripts/poll_chart_topper.py:50`|remediated|A|
|33|`b2b09e9c1ea1a553f16ae40f3e586e97edea0db2f58a67f30c8980faf9536cc1`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`scripts/poll_chart_topper.py:142`|remediated|A|
|34|`339dbbe52d14aaf19f55699cfed8be51ec62f1d7bfa0793ff69ce3d016d5958b`|`javascript.lang.security.detect-child-process.detect-child-process`|`server/services/advancedVideoRendererService.ts:562`|remediated|N|
|35|`a0d5731ca32d12602ffafffacbc6b7484e53937141c8d39d280e8e02d026ab12`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/ai_content_sidecar.py:112`|remediated|A|
|36|`c47a812107ad3893ba9c173cd20e4c2ca2150d9eccf7cfd2d2af10576e44b48b`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/ai_content_sidecar.py:130`|remediated|A|
|37|`e733ecac0c6ccffbccfc59c005e0f6bb7701d4d733f714f707b7cd5a0c07fca5`|`javascript.lang.security.detect-child-process.detect-child-process`|`server/services/backup/databaseBackupService.ts:212`|remediated|N|
|38|`158ac4a2a699d14b126fb871b6e18b9bedacb58ffb8a78a1cfae6c18ca4b96b8`|`python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1`|`server/services/diffusion/advanced_memory.py:333`|remediated|R|
|39|`15e11d7c3a6df74dbc79aa6ddd0c56d62e5b95c79ed2d47ec9fbc0b2a9db4262`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/api_server_v4.py:549`|remediated|A|
|40|`12fe384570e968f69634daed79c7971d191a1b0645c19d119c45e311a9dff61f`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/api_server_v4.py:937`|remediated|A|
|41|`a67e43a546bad2ceb75fa58fdbd476c521d9aee80ce9134b932272d69b3b6316`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/api_server_v4.py:1350`|remediated|A|
|42|`209dd02af50c2f5d686cb381b7b80e9380406971076d2e5f321331f6fdd1f358`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/api_server_v4.py:1465`|remediated|A|
|43|`8014f80c783adc90b1fbad01cf9cbf73ed7fc4074087e880d890c978a5dd7b8b`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/dataset_reader.py:354`|remediated|A|
|44|`a473dda91076645f7ffe7b0eb5881d089514333eccc26ed39efa037219a002a8`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/gen_engine_v2/audio_synth_v2.py:839`|remediated|A|
|45|`41741795206c41c3d608238e18113fd79fb20941f8bc998ba39fc485a40d0204`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/gen_engine_v2/audio_synth_v2.py:864`|remediated|A|
|46|`ba327469e0959cceafd08e4c1659f9a8a60dd34d455a25737c375d3c3144d488`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/gen_engine_v2/audio_synth_v2.py:900`|remediated|A|
|47|`7704ae82bba5f5deeff6f7bede7851d417cd99a70ba8191c7271c7b687e17ea0`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/gen_engine_v2/ltx_adapter.py:160`|remediated|A|
|48|`9a6de2ff492ebe17a516040ac39bf0994ddcad3e25e475406c867b0ac9629a24`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/gen_engine_v2/ltx_adapter.py:180`|remediated|A|
|49|`9f0227ce14c2c11dc55d17796e125aaaadcc458fcfba959d6767ebf27dcf3407`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/gen_engine_v2/ltx_adapter.py:214`|remediated|A|
|50|`c1d1e568dc8273112b2431bb46af3ea86c136383ce8973798a560d0ad541f959`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/maxcore_dataset_bridge.py:100`|remediated|A|
|51|`731f980330b8055d162131a3ee7f36b345163c8e4e88e0a94a1236e0944fde7f`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`server/services/diffusion/maxcore_dataset_bridge.py:144`|remediated|A|
|52|`4b65f4475f545af24b62fb6fee868cf3e981b36f96d6097846f2262b921b805b`|`typescript.react.security.react-insecure-request.react-insecure-request`|`tests/integration/maxcore-local-supervisor.integration.test.ts:27`|reviewed-safe|N|
|53|`941f54dd0628fe09d2c9be936e6b0675b4ec1e6752783d6dda9bba5b2c5deb80`|`typescript.react.security.react-insecure-request.react-insecure-request`|`tests/integration/maxcore-local-supervisor.integration.test.ts:73`|reviewed-safe|N|
|54|`5c245f1ab8c901a59a1cf348ee8501ba6b2291b7d96f9546f649415e04ca4fe4`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`video_diffusion/infer/corpus_bridge.py:104`|remediated|A|
|55|`38b5091b8dfd0009094896726bb4a96f4daa02e02a2e0fa8fbdf6f75be668947`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`video_diffusion/infer/corpus_bridge.py:132`|remediated|A|
|56|`99e0c80626e9f9736898c2f5d8b435885fdf9b7a25c3f9bd92db64137b10da4c`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`video_diffusion/infer/training_bridge.py:80`|remediated|A|
|57|`1c7e53e1e9cc64253f71867e0d4f724b7ea696149737f398fa5fbe3de337dc0b`|`python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected`|`video_diffusion/infer/training_bridge.py:96`|remediated|A|

## Errors: 71/71

- 70 PartialParsing: exact paths/locations in `sast-parser-resolution.md`; exact-70-path scan had 0 errors and TS parse/transform had 0 failures.
- 1 Timeout: `shared/schema.ts`, `javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag`; `sast-timeout-resolution.md` records matching digests and 60/90/120s completion with 0 findings/errors; runner now 90s.

## Final verification status

- Source correction evidence for 0/1 was validated against the current implementation: pickle import/load/dump are removed; the cache uses a versioned data-only JSON/base64 tensor codec with strict metadata/length checks, exact-prompt keys covering the full tensor and model state, and no partial-prefix reuse. `sast-runtime-resolution.md` records the focused regression evidence.
- Source correction evidence for 37 was validated against the current implementation: restore URLs are canonicalized and reject libpq redirection/options/query identity overrides; source/target identity includes effective host, port, and decoded database; `psql` is spawned without a shell using fixed arguments and a restricted environment. `sast-node-resolution.md` records the focused regression evidence.
- The final full scan completed as `reports/readiness-implementation/sast-final-verified.*`; the Final verification section above records its exact totals and retained raw findings.
