# Python tests

These instructions cover canonical MaxCore, application security, evaluator-contract and Sophia runner tests. The generated scratch copies under `.pdim-scratch-external_maxcore-989/` are retained snapshots, not a second application to execute.

## Setup

Use Python 3.12 with the application dependencies from `external/maxcore/artifacts/ai-training-server/pyproject.toml` and its frozen `uv.lock`. The root `pyproject.toml` supplies the shared HTTP/security runtime dependencies. Use the normal application/cloud setup to install these; do not replace the verified CPU Torch wheel with an arbitrary wheel.

Install the additional test transport/runner into that environment:

```sh
python3 -m pip install -r scripts/testing/requirements.txt
```

The complete suite also uses Node 22.12+, a C/C++ compiler, ffmpeg/ffprobe, OpenSSL, Redis server/CLI and espeak-ng. Redis tests start their own temporary Unix-socket server. Missing optional tools produce explicit skipped tests; no production service credentials are needed.

## Run

From the repository root, using the application Python interpreter:

```sh
python3 scripts/testing/run-python-suites.py --list
python3 scripts/testing/run-python-suites.py --output /tmp/maxbooster-python-results --docs /tmp/maxbooster-python-results.md
python3 scripts/testing/run-python-suites.py --file tests/test_secure_http.py --output /tmp/maxbooster-python-single
```

Use `--python /path/to/python` to select another prepared interpreter, `--workers 1` to run serially, or `--timeout 180` to change the per-file timeout. The default is two workers and 120 seconds per file. A selected run writes only its selected suites; use a fresh output directory to preserve earlier reports.

Add `--coverage` to measure first-party Python statements and branches with coverage.py. It is optional for this scoped runner and enabled by the master platform runner. The selected interpreter must contain `coverage>=7.13,<8`; a missing instrumentation dependency blocks the run with a nonzero exit rather than silently falling back to an uninstrumented run.

```sh
python3 scripts/testing/run-python-suites.py --coverage --file tests/test_secure_http.py --output /tmp/maxbooster-python-coverage
```

The runner creates a fresh interpreter, HOME and private model-state directory for each file, removes inherited application credentials, and allows only ephemeral loopback fixture connections. Fixed application ports and external network connections are refused. Each test process group is cleaned up, including after timeouts. The tool never starts training against live public/private records; small in-memory/disposable training fixtures exercise optimizer and checkpoint contracts.

## Read the results

`results.json` records the exact source digest, command, case descriptions, duration, exit code and status for every file. Each executed pytest file also has JUnit XML and a sanitized `.txt` console log. A direct assertion script such as fsspec has a log but no fabricated JUnit case count.

With `--coverage`, `coverage.json` contains standard coverage.py file-level executed/missing lines, executed/missing branches, function summaries and totals; `results.json.coverage` records the instrumentation version, source roots, omitted test/vendor paths and export exit codes. Each run uses a new temporary data directory, combines only its own measurements, exports JSON and removes the SQLite caches. It never merges old runs to inflate coverage. The JSON also binds measured source and selected test-file hashes. A selected-file run measures only that selected scope. Coverage-export success is not a claim that every line/branch or business journey was exercised; canonical source not reached remains visible. Dynamically compiled AST functions and uninstrumented child processes may not map to their original source lines. Nonexistent non-Python runtime labels such as `job-update` are retained with their measured lines/arcs in `coverage.unmappedDynamicFiles` and `coverage.json.maxbooster.unmappedDynamicFiles`; they are not credited to a canonical source file. Missing `.py`, `.pyw`, `.pyi` or `.pyx` source remains a hard export failure. No `ignore_errors` or blanket reporter exclusions are used. A prior failed dynamic-source export is retained under `coverage-diagnostics/` when the output directory is reused.

A passing file may contain skipped cases; skips are counted separately. Blocked live/operational tools and helper modules are inventoried but never counted as passes. The runner exits nonzero for any failed, timed-out or unexpectedly empty executable suite. Its zero exit is a statement about the executed subset, not a claim that blocked journeys or production readiness passed.

## Recorded run

- Source baseline: `a1603b13b6352a978e3877a2f43f1ccd98a98a18`; individual `sourceSha256` fields bind test-file contents, including reviewed fixture updates.
- Files: {"blocked": 19, "empty": 0, "failed": 0, "passed": 111, "skipped": 1, "timeout": 0}.
- JUnit cases: 1381; failures: 0; errors: 0; skipped: 12.
- Original model quality, live provider delivery and a production deployment are not certified by these tests.

## Every Python suite

The wrapper commands below reproduce the same isolated per-file execution. For blocked entries the command reports the missing prerequisite without contacting the running application. Live generation/load tools need a separately prepared disposable server at their documented ports; they must not be pointed at the developer or production server to make this report green.

### `evaluations/maxcore-quality/test_protocol.py`

Fast evaluator-contract tests: no model import or inference.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file evaluations/maxcore-quality/test_protocol.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 4}.

<details>
<summary>What each case checks</summary>

- `ProtocolTests.test_connected_runner_protects_checkpoint_and_generated_files`: connected runner protects checkpoint and generated files
- `ProtocolTests.test_fixed_cases_and_seeds`: fixed cases and seeds
- `ProtocolTests.test_overlap_is_detected_without_corpus_leakage`: overlap is detected without corpus leakage
- `ProtocolTests.test_digest_and_normalization`: digest and normalization

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/audio/test_audio_analysis.py`

Tests for the Conductor (audio_analysis). Run:

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/audio/test_audio_analysis.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `test_bpm_detection`: bpm detection
- `test_determinism`: determinism
- `test_energy_and_sections`: energy and sections
- `test_band_envelopes`: band envelopes
- `test_totality`: totality
- `test_encoder_integration`: encoder integration

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/audio/test_controls.py`

test controls

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/audio/test_controls.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 4}.

<details>
<summary>What each case checks</summary>

- `test_real_short_piano_wav_decodes`: real short piano wav decodes
- `test_instrument_isolation_and_rejection`: instrument isolation and rejection
- `test_arrangement_stays_within_short_duration`: arrangement stays within short duration
- `test_real_arrangement_control_changes_samples`: real arrangement control changes samples

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/audio/test_media_facade.py`

Real backend execution and decodes, not facade-call mocks.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/audio/test_media_facade.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 12}.

<details>
<summary>What each case checks</summary>

- `test_media_facade_is_real_dispatch_and_unknown_ops_fail`: media facade is real dispatch and unknown ops fail
- `test_dither_and_pcm_are_lossless_against_original_arithmetic`: dither and pcm are lossless against original arithmetic
- `test_image_video_backgrounds_use_same_real_gradient_kernel`: image video backgrounds use same real gradient kernel
- `test_actual_audio_artifact_depends_on_executed_kernel`: actual audio artifact depends on executed kernel
- `test_all_supported_instruments_real_pcm_and_signal_dispatch`: all supported instruments real pcm and signal dispatch
- `test_delay_and_glitch_signal_kernels_have_actual_effect`: delay and glitch signal kernels have actual effect
- `test_rbj_coefficients_and_envelopes_match_reference`: rbj coefficients and envelopes match reference
- `test_failed_signal_kernel_is_not_silently_bypassed`: failed signal kernel is not silently bypassed

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/audio/test_short_duration.py`

Short soundtrack planning regression; does not run native synthesis.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/audio/test_short_duration.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `ShortSoundtrackTest.test_short_lofi_has_chords_and_drums_not_intro_only`: short lofi has chords and drums not intro only
- `ShortSoundtrackTest.test_intent_routes_to_lofi_piano_with_quieter_drums`: intent routes to lofi piano with quieter drums
- `ShortSoundtrackTest.test_struck_string_has_harmonics_decay_and_damped_release`: struck string has harmonics decay and damped release

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py`

Isolated fixtures only; never accesses production PDIM or live network.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_engine.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 26}.

<details>
<summary>What each case checks</summary>

- `AwarenessTests.test_source_observation_writes_are_fenced_by_ingest_ownership`: source observation writes are fenced by ingest ownership
- `AwarenessTests.test_partial_source_observations_survive_incomplete_snapshot`: partial source observations survive incomplete snapshot
- `AwarenessTests.test_invalid_snapshot_reports_safe_failure_category`: invalid snapshot reports safe failure category
- `AwarenessTests.test_clean_is_idempotent_after_nested_html_entity_decoding`: clean is idempotent after nested html entity decoding
- `AwarenessTests.test_clean_reaches_a_fixed_point_after_all_sanitization_steps`: clean reaches a fixed point after all sanitization steps
- `AwarenessTests.test_all_domains_provenance_hash_and_immutable_copy`: all domains provenance hash and immutable copy
- `AwarenessTests.test_hash_and_pointer_validation_on_restart`: hash and pointer validation on restart
- `AwarenessTests.test_incomplete_keeps_previous_only_until_ttl`: incomplete keeps previous only until ttl
- `AwarenessTests.test_optional_facade_context_and_bound_snapshot_revalidation`: optional facade context and bound snapshot revalidation
- `AwarenessTests.test_no_empty_or_all_failed_rehashed_snapshot`: no empty or all failed rehashed snapshot
- `AwarenessTests.test_actual_kernel_numeric_ranking`: actual kernel numeric ranking
- `AwarenessTests.test_untrusted_content`: untrusted content
- `AwarenessTests.test_lifecycle_idempotent_and_stops`: lifecycle idempotent and stops
- `AwarenessTests.test_missing_domain_never_published`: missing domain never published
- `AwarenessTests.test_publication_failure_keeps_last_acknowledged_snapshot`: publication failure keeps last acknowledged snapshot
- `AwarenessTests.test_fenced_publication_error_is_safely_classified`: fenced publication error is safely classified
- `AwarenessTests.test_secondary_phrase_storage_failure_has_safe_operation_category`: secondary phrase storage failure has safe operation category
- `AwarenessTests.test_malformed_optional_legacy_source_metadata_is_ignored`: malformed optional legacy source metadata is ignored
- `AwarenessTests.test_publication_command_error_does_not_expose_exception_text`: publication command error does not expose exception text
- `AwarenessTests.test_timeout_is_not_knowledge_and_retry_backs_off`: timeout is not knowledge and retry backs off
- `AwarenessTests.test_nested_bind_restores_and_invalid_hash_is_rejected`: nested bind restores and invalid hash is rejected
- `PeakObservationSelectionTests.test_contextual_headlines_and_unsupported_sources_do_not_become_peak_examples`: contextual headlines and unsupported sources do not become peak examples
- `PeakObservationSelectionTests.test_full_content_top_engagement_within_source_domain_balance_and_policy_hash`: full content top engagement within source domain balance and policy hash
- `PeakObservationSelectionTests.test_ledger_full_body_preserved_and_stale_observations_excluded`: ledger full body preserved and stale observations excluded
- `PeakObservationSelectionTests.test_peak_selection_excludes_fake_origin_zero_and_irrelevant`: peak selection excludes fake origin zero and irrelevant
- `PeakObservationSelectionTests.test_duplicate_full_content_does_not_amplify_training_weight`: duplicate full content does not amplify training weight

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py`

Real Lua/Redis atomicity tests in an isolated temporary Unix-socket Redis.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_lease.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `AtomicLeaseTests.test_contenders_and_owner_checked_heartbeat_release`: contenders and owner checked heartbeat release
- `AtomicLeaseTests.test_lost_lease_cannot_overwrite_successor_pointer`: lost lease cannot overwrite successor pointer
- `AtomicLeaseTests.test_same_owner_out_of_order_publication_rejected`: same owner out of order publication rejected
- `AtomicLeaseTests.test_server_clock_rejects_expired_publication`: server clock rejects expired publication
- `AtomicLeaseTests.test_published_snapshot_loads_into_follower_without_ingest`: published snapshot loads into follower without ingest
- `AtomicLeaseTests.test_previous_id_only_pointer_migrates_without_regression`: previous id only pointer migrates without regression

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_sources.py`

test sources

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_sources.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 29}.

<details>
<summary>What each case checks</summary>

- `SourceCoverageTests.test_youtube_feed_uses_safe_parser_and_real_view_count`: youtube feed uses safe parser and real view count
- `SourceCoverageTests.test_youtube_feed_rejects_entity_declarations`: youtube feed rejects entity declarations
- `SourceCoverageTests.test_all_ten_original_feeds_are_retained_without_keys`: all ten original feeds are retained without keys
- `SourceCoverageTests.test_inherited_search_credentials_enable_both_providers`: inherited search credentials enable both providers
- `SourceCoverageTests.test_atom_editorial_feed_is_not_invented_engagement`: atom editorial feed is not invented engagement
- `LandscapeSourceTests.test_landscape_feed_empty_without_endpoint`: landscape feed empty without endpoint
- `LandscapeSourceTests.test_landscape_feed_rejects_unknown_kind`: landscape feed rejects unknown kind
- `LandscapeSourceTests.test_landscape_feed_parses_fixture`: landscape feed parses fixture
- `LandscapeSourceTests.test_landscape_feed_degrades_on_bad_payloads`: landscape feed degrades on bad payloads
- `LandscapeSourceTests.test_configured_sources_registers_landscape`: configured sources registers landscape
- `LandscapeSourceTests.test_configured_sources_omits_landscape_without_config`: configured sources omits landscape without config
- `LandscapeSourceTests.test_trends_lines_format`: trends lines format
- `PeakSourceTests.test_complete_public_content_actual_counts_and_canonical_citation`: complete public content actual counts and canonical citation
- `PeakSourceTests.test_no_missing_fabricated_negative_boolean_or_nonfinite_counts`: no missing fabricated negative boolean or nonfinite counts
- `PeakSourceTests.test_old_future_irrelevant_short_instructions_and_oversized_posts_excluded`: old future irrelevant short instructions and oversized posts excluded
- `PeakSourceTests.test_flagged_and_noncanonical_public_record_addresses_excluded`: flagged and noncanonical public record addresses excluded
- `PeakSourceTests.test_mastodon_only_public_recent_complete_measured_posts_are_peak`: mastodon only public recent complete measured posts are peak
- `PeakSourceTests.test_mastodon_context_omits_empty_unsafe_or_unresolvable_observations`: mastodon context omits empty unsafe or unresolvable observations
- `PeakSourceTests.test_mastodon_short_zero_counter_context_is_canonical_not_a_peak_example`: mastodon short zero counter context is canonical not a peak example
- `PeakSourceTests.test_mastodon_peak_combines_actual_trending_and_topic_counters_deduplicated`: mastodon peak combines actual trending and topic counters deduplicated

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/director/test_director.py`

test director

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/director/test_director.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 14}.

<details>
<summary>What each case checks</summary>

- `StoryBibleTests.test_build_bible`: build bible
- `StoryBibleTests.test_for_platform`: for platform
- `AwarenessBusTests.test_snapshot`: snapshot
- `AwarenessBusTests.test_for_platform`: for platform
- `PlatformTests.test_all_platforms`: all platforms
- `PlatformTests.test_tiktok_specific`: tiktok specific
- `CriticTests.test_critique_social`: critique social
- `CampaignDirectorTests.test_full_campaign`: full campaign
- `CampaignDirectorTests.test_multi_platform`: multi platform
- `IterativeLoopTests.test_loop_improves`: loop improves
- `IterativeLoopTests.test_loop_handles_generation_failure`: loop handles generation failure
- `ConfigTests.test_defaults`: defaults
- `ConfigTests.test_env_override`: env override
- `PersistenceTests.test_save_load_bible`: save load bible

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/generation/test_campaign.py`

Campaign generation must not substitute the retired template composer.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/generation/test_campaign.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 2}.

<details>
<summary>What each case checks</summary>

- `CampaignFailClosedTests.test_campaign_reports_unavailable_backend_without_snapshot_gate`: campaign reports unavailable backend without snapshot gate
- `CampaignFailClosedTests.test_bound_campaign_explicitly_reports_missing_learned_backend`: bound campaign explicitly reports missing learned backend

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/tests/test_native_kernels.py`

Tests for the native SIMD kernel library.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/tests/test_native_kernels.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 15}.

<details>
<summary>What each case checks</summary>

- `test_fallback_is_available_without_compiler`: fallback is available without compiler
- `test_affine_relu_sq_correct`: affine relu sq correct
- `test_hardswish_correct`: hardswish correct
- `test_axpby_correct_and_shape_guard`: axpby correct and shape guard
- `test_rmsnorm_rows_correct_and_guards`: rmsnorm rows correct and guards
- `test_non_float32_input_routes_correctly`: non float32 input routes correctly
- `test_silu_correct`: silu correct
- `test_gelu_correct`: gelu correct
- `test_softmax_rows_correct_and_guards`: softmax rows correct and guards
- `test_layernorm_rows_correct_and_guards`: layernorm rows correct and guards
- `test_row_kernels_empty_input_no_crash`: row kernels empty input no crash
- `test_describe_never_claims_hardware`: describe never claims hardware
- `test_compiler_cache_reuse`: compiler cache reuse
- `test_never_raise_on_broken_cache_dir`: never raise on broken cache dir
- `test_concurrent_same_key_compile_no_raise`: concurrent same key compile no raise

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_backend_bridge.py`

Tests for the DigitalGPUBackend bridge methods: alloc/free/run_kernel.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_backend_bridge.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 8}.

<details>
<summary>What each case checks</summary>

- `test_alloc_returns_usable_handle_and_free`: alloc returns usable handle and free
- `test_alloc_rejects_negative`: alloc rejects negative
- `test_alloc_rejects_fractional_size`: A fractional byte size must raise, not silently truncate.
- `test_run_kernel_gemm_matches_numpy`: run kernel gemm matches numpy
- `test_run_kernel_attention_matches_reference`: run kernel attention matches reference
- `test_run_kernel_case_insensitive`: run kernel case insensitive
- `test_run_kernel_refuses_fp8_sm102_kernel`: A hardware-implying name must raise, not silently run numpy.
- `test_run_kernel_unknown_name_lists_supported`: run kernel unknown name lists supported

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_gpu_comprehensive.py`

Comprehensive tests for the digital GPU system.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_digital_gpu_comprehensive.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 137}.

<details>
<summary>What each case checks</summary>

- `TestVRAM.test_alloc_returns_integer_handle`: alloc returns integer handle
- `TestVRAM.test_alloc_non_ndarray_raises_type_error`: alloc non ndarray raises type error
- `TestVRAM.test_get_returns_same_array`: get returns same array
- `TestVRAM.test_get_invalid_handle_raises`: get invalid handle raises
- `TestVRAM.test_meta_returns_shape_dtype_size`: meta returns shape dtype size
- `TestVRAM.test_meta_invalid_handle_raises`: meta invalid handle raises
- `TestVRAM.test_free_removes_handle`: free removes handle
- `TestVRAM.test_handles_are_monotonically_increasing`: handles are monotonically increasing
- `TestVRAM.test_free_nonexistent_handle_is_silent`: free nonexistent handle is silent
- `TestSIMDCore.test_gemm_tiled_matches_numpy`: gemm tiled matches numpy
- `TestSIMDCore.test_gemm_non_square_matches_numpy`: gemm non square matches numpy
- `TestSIMDCore.test_gemm_1d_input_raises`: gemm 1d input raises
- `TestSIMDCore.test_gemm_inner_dim_mismatch_raises`: gemm inner dim mismatch raises
- `TestSIMDCore.test_add_correct`: add correct
- `TestSIMDCore.test_add_shape_mismatch_raises`: add shape mismatch raises
- `TestSIMDCore.test_add_dtype_mismatch_raises`: add dtype mismatch raises
- `TestSIMDCore.test_softmax_rows_sum_to_one`: softmax rows sum to one
- `TestSIMDCore.test_softmax_numerically_stable_large_values`: softmax numerically stable large values
- `TestSIMDCore.test_softmax_axis_0`: softmax axis 0
- `TestSIMDCore.test_attention_self_matches_reference`: attention self matches reference
- `TestSIMDCore.test_attention_causal_masks_future`: attention causal masks future
- `TestSIMDCore.test_attention_batched_higher_rank`: attention batched higher rank
- `TestSIMDCore.test_attention_shape_mismatch_raises`: attention shape mismatch raises
- `TestSIMDCore.test_attention_1d_raises`: attention 1d raises
- `TestSIMDCore.test_gemm_bias_relu_nonnegative`: gemm bias relu nonnegative
- `TestSIMDCore.test_gemm_bias_relu_matches_manual`: gemm bias relu matches manual
- `TestSchedulerProgram.test_gemm_program_correct`: gemm program correct
- `TestSchedulerProgram.test_add_program_correct`: add program correct
- `TestSchedulerProgram.test_softmax_program_correct`: softmax program correct
- `TestSchedulerProgram.test_multi_instruction_program_and_profile`: multi instruction program and profile
- `TestSchedulerProgram.test_profile_opcode_names`: profile opcode names
- `TestSchedulerProgram.test_bad_handle_raises_gpu_error`: bad handle raises gpu error
- `TestDigitalGPUFunctional.test_gemm_matches_numpy`: gemm matches numpy
- `TestDigitalGPUFunctional.test_add_matches_numpy`: add matches numpy
- `TestDigitalGPUFunctional.test_softmax_sums_to_one`: softmax sums to one
- `TestDigitalGPUFunctional.test_attention_shape_preserved`: attention shape preserved
- `TestDigitalGPUFunctional.test_attention_causal_matches_reference`: attention causal matches reference
- `TestDigitalGPUFunctional.test_gemm_bias_relu_nonneg`: gemm bias relu nonneg
- `TestDigitalGPUFunctional.test_last_profile_populated_after_gemm`: last profile populated after gemm
- `TestDigitalGPUFunctional.test_silicon_report_none_without_model`: silicon report none without model
- `TestDigitalGPUHandleAPI.test_h_gemm_correct`: h gemm correct
- `TestDigitalGPUHandleAPI.test_h_add_correct`: h add correct
- `TestDigitalGPUHandleAPI.test_h_softmax_correct`: h softmax correct
- `TestDigitalGPUHandleAPI.test_h_attention_shape`: h attention shape
- `TestDigitalGPUHandleAPI.test_h_attention_causal`: h attention causal
- `TestDigitalGPUHandleAPI.test_h_gemm_bias_relu_nonneg`: h gemm bias relu nonneg
- `TestDigitalGPUHandleAPI.test_h_gemm_bad_handle_raises`: h gemm bad handle raises
- `TestHyperVRAM.test_oom_raises_when_capacity_exceeded`: oom raises when capacity exceeded
- `TestHyperVRAM.test_unlimited_capacity_accepts_large_array`: unlimited capacity accepts large array
- `TestHyperVRAM.test_used_bytes_correct_after_alloc`: used bytes correct after alloc
- `TestHyperVRAM.test_peak_bytes_tracks_high_water_mark`: peak bytes tracks high water mark
- `TestHyperVRAM.test_flush_clears_all_handles`: flush clears all handles
- `TestHyperVRAM.test_status_returns_expected_keys`: status returns expected keys
- `TestMemoryPool.test_alloc_returns_id_and_array`: alloc returns id and array
- `TestMemoryPool.test_get_returns_same_object`: get returns same object
- `TestMemoryPool.test_get_invalid_handle_raises`: get invalid handle raises
- `TestMemoryPool.test_free_reduces_current_bytes`: free reduces current bytes
- `TestMemoryPool.test_peak_bytes_does_not_drop_on_free`: peak bytes does not drop on free
- `TestMemoryPool.test_flush_returns_freed_bytes_and_clears`: flush returns freed bytes and clears
- `TestMemoryPool.test_status_keys`: status keys
- `TestMemoryPool.test_concurrent_alloc_free_no_crash`: concurrent alloc free no crash
- `TestTensorCoreUnit.test_matmul_correct`: matmul correct
- `TestTensorCoreUnit.test_matmul_increments_ops_and_flops`: matmul increments ops and flops
- `TestTensorCoreUnit.test_mixed_precision_matmul_tolerance_from_precision_model`: mixed precision matmul tolerance from precision model
- `TestTensorCoreUnit.test_mixed_precision_increments_flops_by_multiplier`: mixed precision increments flops by multiplier
- `TestTensorCoreUnit.test_status_keys_and_types`: status keys and types
- `TestHyperSIMDCore.test_tensor_core_gemm_correct`: tensor core gemm correct
- `TestHyperSIMDCore.test_tensor_core_gemm_1d_raises`: tensor core gemm 1d raises
- `TestHyperSIMDCore.test_tensor_core_gemm_inner_dim_mismatch_raises`: tensor core gemm inner dim mismatch raises
- `TestHyperSIMDCore.test_tensor_core_gemm_increments_total_ops`: tensor core gemm increments total ops
- `TestHyperSIMDCore.test_batched_gemm_3d_correct`: batched gemm 3d correct
- `TestHyperSIMDCore.test_batched_gemm_2d_correct`: batched gemm 2d correct
- `TestHyperSIMDCore.test_batched_gemm_inner_dim_mismatch_raises`: batched gemm inner dim mismatch raises
- `TestHyperSIMDCore.test_mixed_precision_gemm_tolerance_from_precision_model`: mixed precision gemm tolerance from precision model
- `TestHyperSIMDCore.test_mixed_precision_gemm_wrong_rank_raises`: mixed precision gemm wrong rank raises
- `TestHyperSIMDCore.test_layer_norm_output_shape`: layer norm output shape
- `TestHyperSIMDCore.test_layer_norm_zero_mean_unit_var`: layer norm zero mean unit var
- `TestHyperSIMDCore.test_batch_norm_training_output_shape`: batch norm training output shape
- `TestHyperSIMDCore.test_batch_norm_eval_without_running_stats_raises`: batch norm eval without running stats raises
- `TestHyperSIMDCore.test_batch_norm_eval_with_running_stats`: batch norm eval with running stats
- `TestHyperSIMDCore.test_gelu_shape_preserved`: gelu shape preserved
- `TestHyperSIMDCore.test_gelu_matches_tanh_approximation`: gelu matches tanh approximation
- `TestHyperSIMDCore.test_silu_shape_preserved`: silu shape preserved
- `TestHyperSIMDCore.test_silu_matches_sigmoid_gate`: silu matches sigmoid gate
- `TestHyperSIMDCore.test_conv3d_output_shape_no_padding`: conv3d output shape no padding
- `TestHyperSIMDCore.test_conv3d_channel_mismatch_raises`: conv3d channel mismatch raises
- `TestHyperSIMDCore.test_conv3d_wrong_rank_raises`: conv3d wrong rank raises
- `TestHyperSIMDCore.test_grouped_gemm_all_correct`: grouped gemm all correct
- `TestHyperSIMDCore.test_grouped_gemm_mismatched_count_raises`: grouped gemm mismatched count raises
- `TestHyperSIMDCore.test_fused_attention_norm_shape`: fused attention norm shape
- `TestHyperSIMDCore.test_fused_attention_norm_equals_attn_then_layernorm`: fused attention norm equals attn then layernorm
- `TestHyperSIMDCore.test_status_has_expected_keys`: status has expected keys
- `TestHyperGPU.test_attention_matches_flash`: attention matches flash
- `TestHyperGPU.test_flash_attention_causal_differs_from_noncausal`: flash attention causal differs from noncausal
- `TestHyperGPU.test_conv2d_output_shape`: conv2d output shape
- `TestHyperGPU.test_conv3d_output_shape`: conv3d output shape
- `TestHyperGPU.test_layer_norm_output_shape`: layer norm output shape
- `TestHyperGPU.test_batch_norm_training_output_shape`: batch norm training output shape
- `TestHyperGPU.test_gelu_shape_preserved`: gelu shape preserved
- `TestHyperGPU.test_silu_shape_preserved`: silu shape preserved
- `TestHyperGPU.test_softmax_sums_to_one`: softmax sums to one
- `TestHyperGPU.test_add_correct`: add correct
- `TestHyperGPU.test_grouped_gemm_all_correct`: grouped gemm all correct
- `TestHyperGPU.test_fused_attention_norm_shape`: fused attention norm shape
- `TestHyperGPU.test_flush_vram_no_crash`: flush vram no crash
- `TestHyperGPU.test_silicon_report_none_without_model`: silicon report none without model
- `TestHyperGPU.test_status_has_expected_keys`: status has expected keys
- `TestHyperGPU.test_total_compute_ms_grows_after_ops`: total compute ms grows after ops
- `TestHyperGPUGemmComputePath.test_gemm_matches_numpy_tight_tolerance`: gemm matches numpy tight tolerance
- `TestHyperGPUGemmComputePath.test_mixed_gemm_tolerance_from_precision_model`: mixed gemm tolerance from precision model
- `TestHyperGPUGemmComputePath.test_gemm_batched_matches_numpy_tight_tolerance`: gemm batched matches numpy tight tolerance
- `TestPocketAcceleratorBehavior.test_first_call_is_miss_second_is_hit`: first call is miss second is hit
- `TestPocketAcceleratorBehavior.test_stats_reflect_hit_and_miss`: stats reflect hit and miss
- `TestPocketAcceleratorBehavior.test_different_values_produce_different_cache_entries`: different values produce different cache entries
- `TestPocketAcceleratorBehavior.test_cached_value_is_numerically_identical_to_computed_value`: cached value is numerically identical to computed value
- `TestPocketAcceleratorBehavior.test_disable_env_var_routes_all_calls_to_compute`: disable env var routes all calls to compute
- `TestGPUClusterNode.test_initial_state_is_idle`: initial state is idle
- `TestGPUClusterNode.test_assign_sets_busy`: assign sets busy
- `TestGPUClusterNode.test_release_restores_idle`: release restores idle
- `TestGPUClusterNode.test_status_has_expected_keys`: status has expected keys
- `TestGPUCluster.test_num_nodes_correct`: num nodes correct
- `TestGPUCluster.test_get_idle_node_returns_node`: get idle node returns node
- `TestGPUCluster.test_get_idle_node_none_when_all_busy`: get idle node none when all busy
- `TestGPUCluster.test_get_node_invalid_id_raises`: get node invalid id raises
- `TestGPUCluster.test_all_reduce_gradients_averages`: all reduce gradients averages
- `TestGPUCluster.test_all_reduce_empty_raises`: all reduce empty raises
- `TestGPUCluster.test_scatter_data_splits_evenly`: scatter data splits evenly
- `TestGPUCluster.test_gather_results_concatenates`: gather results concatenates
- `TestGPUCluster.test_scatter_then_gather_roundtrip`: scatter then gather roundtrip
- `TestGPUCluster.test_add_node_increments_count`: add node increments count
- `TestGPUCluster.test_remove_node_decrements_count`: remove node decrements count
- `TestGPUCluster.test_total_lanes_computed`: total lanes computed
- `TestGPUCluster.test_total_tensor_cores_computed`: total tensor cores computed
- `TestGPUCluster.test_flush_all_no_crash`: flush all no crash
- `TestGPUCluster.test_status_has_expected_keys`: status has expected keys
- `TestGPUCluster.test_run_distributed_correct`: run_distributed fans a lambda out across nodes and collects results.
- `TestGPUCluster.test_run_distributed_correct_under_concurrency`: Four concurrent distributed jobs on disjoint node sets produce correct results.

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_kernels.py`

Regression tests for the redesigned HyperSIMDCore kernels.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_kernels.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `test_flash_matches_naive_self_attention`: flash matches naive self attention
- `test_flash_cross_attention_tk_ne_tq`: flash cross attention tk ne tq
- `test_flash_block_size_clamped_not_crashing`: flash block size clamped not crashing
- `test_conv2d_preserves_input_dtype`: conv2d preserves input dtype
- `test_conv2d_matches_naive_strided_padded`: conv2d matches naive strided padded

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_pocket_execution.py`

Real small-kernel/inference checks; no checkpoints or training involved.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_pocket_execution.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 1, "tests": 18}.

<details>
<summary>What each case checks</summary>

- `test_real_prefill_decode_use_life_not_idle_model_gpu`: real prefill decode use life not idle model gpu
- `test_concurrent_shared_proxy_isolation`: concurrent shared proxy isolation
- `test_nested_scope_and_exception_cleanup`: nested scope and exception cleanup
- `test_async_scope_propagates_to_thread`: async scope propagates to thread
- `test_cancel_during_allocation_retires_unclaimed_life`: cancel during allocation retires unclaimed life
- `test_existing_storage_disk_adapter_persists_lifecycle`: existing storage disk adapter persists lifecycle
- `test_storage_failure_fails_admission_without_fake_life`: storage failure fails admission without fake life
- `test_kernel_errors_propagate_without_math_fallback`: kernel errors propagate without math fallback
- `test_silicon_failure_does_not_abort_real_kernel`: silicon failure does not abort real kernel
- `test_lossless_state_roundtrip_and_decode`: lossless state roundtrip and decode
- `test_canonical_pdim_state_roundtrip`: canonical pdim state roundtrip
- `test_canonical_recursive_capsules_survive_owner_reconstruction`: canonical recursive capsules survive owner reconstruction
- `test_array_decoder_rejects_corrupt_shape`: array decoder rejects corrupt shape
- `test_inplace_kv_decode_state_recovery`: inplace kv decode state recovery
- `test_cancelled_worker_drains_before_retirement`: cancelled worker drains before retirement
- `test_pool_compute_totals_include_active_and_retired_once`: pool compute totals include active and retired once
- `test_state_write_failure_keeps_actual_retired_compute_totals`: state write failure keeps actual retired compute totals
- `test_concurrent_active_metrics_survive_worker_retirement`: concurrent active metrics survive worker retirement

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_silicon_model.py`

Tests for the digital-silicon performance model and its wiring.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/gpu/tests/test_silicon_model.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 8}.

<details>
<summary>What each case checks</summary>

- `test_report_is_labeled_estimate_not_measurement`: report is labeled estimate not measurement
- `test_model_op_accumulates_estimates`: model op accumulates estimates
- `test_gemm_routes_to_gemm_tile_attention_to_attention_tile`: gemm routes to gemm tile attention to attention tile
- `test_simulate_drains_and_reports_cycles`: simulate drains and reports cycles
- `test_attaching_silicon_does_not_change_digitalgpu_results`: attaching silicon does not change digitalgpu results
- `test_attaching_silicon_does_not_change_hypergpu_results`: attaching silicon does not change hypergpu results
- `test_mixed_gemm_with_silicon_does_not_crash`: mixed gemm with silicon does not crash
- `test_concurrent_model_and_report_are_stable`: concurrent model and report are stable

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/image/test_controls.py`

test controls

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/image/test_controls.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 12}.

<details>
<summary>What each case checks</summary>

- `test_dedicated_poster_dimensions_and_real_decode`: dedicated poster dimensions and real decode
- `test_unsupported_is_not_a_poster`: unsupported is not a poster
- `test_real_compact_poster_exports_exact_dimensions`: real compact poster exports exact dimensions
- `test_compact_supplied_background_is_not_forced_through_typography`: compact supplied background is not forced through typography

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/image/test_image_contract.py`

Lightweight regression checks: no model inference or GPU needed.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/image/test_image_contract.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 4}.

<details>
<summary>What each case checks</summary>

- `test_typographic_poster_still_renders_release_text`: typographic poster still renders release text
- `test_artwork_only_without_rendered_background_fails`: artwork only without rendered background fails
- `test_typography_fits_measured_width_and_rejects_unfittable_words`: typography fits measured width and rejects unfittable words
- `test_rta_requires_subject_and_rejects_unrepresentable_scene`: rta requires subject and rejects unrepresentable scene

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/tests/test_select_backend.py`

Tests for the honest backend auto-selector (registry.select_backend).

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/tests/test_select_backend.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 8}.

<details>
<summary>What each case checks</summary>

- `test_default_selects_runnable_backend`: Default preference returns a backend that actually reports available.
- `test_digital_gpu_host_falls_through_from_cuda`: On a host without CUDA, 'gpu' is unavailable so we get the Digital GPU backend.
- `test_never_returns_unavailable_backend`: The selector must not hand back a backend whose is_available() is False.
- `test_gpu_device_cpu_validation_path_is_selectable`: GPUBackend(device='cpu') is runnable (torch-CPU validation path).
- `test_empty_preference_still_yields_digital_gpu_fallback`: Even with an empty preference, the guaranteed Digital GPU safety net kicks in.
- `test_unknown_preference_is_skipped_not_fatal`: An unknown backend name is skipped; a valid one after it still wins.
- `test_gpu_only_kwarg_still_falls_back_to_digital_gpu`: `device="cuda"` on a Digital GPU host: gpu is unavailable and the kwarg is rejected by the DigitalGPUBackend constructor, but the no-kwarg Digital GPU safety net still wins.
- `test_unexpected_probe_fault_is_surfaced_not_masked`: A real fault in a backend's is_available() must propagate, not be silently downgraded to Digital GPU — an operational bug can't masquerade as 'no hardware'.

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/benchmark_gpu_native.py`

benchmark_gpu_native.py — honest, CPU-only performance report and regression gate for the digital GPU's kernel and orchestration layers.

Status: **blocked**. Native kernel performance benchmark; separate opt-in performance experiment, not an assertion suite.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/benchmark_gpu_native.py --output /tmp/maxbooster-python-single
```

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/benchmark_vs_reference_gpu.py`

benchmark_vs_reference_gpu.py — functional / same-parameter comparison between this project's own software GPU-native stack (``SiliconSimtBackend``, executing on this container's CPU) and the published specifications of a real, physical, currently-shipping GPU.

Status: **blocked**. Native/reference CPU/GPU performance comparison; no calibrated GPU hardware in this environment.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/benchmark_vs_reference_gpu.py --output /tmp/maxbooster-python-single
```

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/endpoint_load_test.py`

HTTP load / concurrency test for the live MaxCore generation endpoints.

Status: **blocked**. Live endpoint load generator, not an offline unit suite; requires disposable operational model server.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/endpoint_load_test.py --output /tmp/maxbooster-python-single
```

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py`

90M-scale concurrency smoke / load test for the MaxCore DigitalGPU stack.

Status: **blocked**. 90M-scale CPU/concurrency benchmark; no bounded unit-test contract or isolated service fixture.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py --output /tmp/maxbooster-python-single
```

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py`

Tests for the from-scratch memory (VramPool) and orchestration (StreamScheduler) layers, and their integration into Runtime/DigitalGPU.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_gpu_native_orchestration.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 23}.

<details>
<summary>What each case checks</summary>

- `test_pool_alloc_free_accounting`: pool alloc free accounting
- `test_pool_bucket_reuse_does_not_grow_reservation`: pool bucket reuse does not grow reservation
- `test_pool_oom_is_real_and_raised`: pool oom is real and raised
- `test_pool_trim_reclaims_idle_slabs`: pool trim reclaims idle slabs
- `test_pool_peak_tracking_survives_frees`: pool peak tracking survives frees
- `test_pool_thread_safety_under_concurrent_alloc_free`: pool thread safety under concurrent alloc free
- `test_assign_streams_keeps_dependency_chain_together`: assign streams keeps dependency chain together
- `test_scheduler_produces_correct_results_for_diamond_graph`: scheduler produces correct results for diamond graph
- `test_scheduler_achieves_real_wall_clock_overlap`: Proves genuine concurrency, not just non-crashing correctness: N independent sleeping nodes finish in roughly one sleep duration when given enough lanes, not N sleep durations.
- `test_scheduler_propagates_error_without_hanging`: scheduler propagates error without hanging
- `test_runtime_num_streams_does_not_change_numeric_result`: runtime num streams does not change numeric result
- `test_runtime_frees_intermediate_tensors_but_not_outputs`: runtime frees intermediate tensors but not outputs
- `test_runtime_vram_oom_propagates_through_graph_run`: runtime vram oom propagates through graph run
- `test_smi_reports_backend_memory_and_streams`: smi reports backend memory and streams
- `test_num_streams_env_var_default`: num streams env var default
- `test_shm_tensor_payload_eligibility`: shm tensor payload eligibility
- `test_shm_put_falls_back_when_not_tensor_or_arena_missing`: shm put falls back when not tensor or arena missing
- `test_shm_fast_path_used_and_correct_for_large_tensors`: A graph run whose values are well above the 1MiB scratch floor must actually exercise the shared-memory arena (not silently fall back the whole time), and must still produce numerically correct results.
- `test_shm_arena_grows_across_runs_and_stays_correct`: A pool that first runs a small graph, then a much larger one, must grow its arena rather than staying pinned to the first run's size -- and every value must still round-trip correctly across the resize.
- `test_shm_shutdown_unlinks_arena_no_leak`: `shutdown()` must `unlink()` the arena it created -- leaving it behind would leak a real OS-level /dev/shm segment for every pool ever built.
- `test_shm_alloc_bump_and_capacity_boundary`: shm alloc bump and capacity boundary
- `test_shm_put_get_roundtrip_various_shapes_and_dtypes`: shm put get roundtrip various shapes and dtypes
- `test_shm_put_falls_back_when_arena_is_full`: shm put falls back when arena is full

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_hardware.py`

Tests for the runtime thread/hardware configuration.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_hardware.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 7}.

<details>
<summary>What each case checks</summary>

- `test_single_worker_uses_all_cores`: single worker uses all cores
- `test_reserve_cpus_for_scales_with_host_size`: reserve cpus for scales with host size
- `test_reserve_cpus_for_rejects_invalid_cpus`: reserve cpus for rejects invalid cpus
- `test_multi_worker_avoids_oversubscription`: multi worker avoids oversubscription
- `test_reserve_keeps_cores_free`: reserve keeps cores free
- `test_invalid_args_raise`: invalid args raise
- `test_configure_respects_existing_then_overrides`: configure respects existing then overrides

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_maxcore.py`

Tests for the MaxCore / DigitalGPU stack.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_maxcore.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 31}.

<details>
<summary>What each case checks</summary>

- `test_ir_build_validate_hash`: ir build validate hash
- `test_ir_rejects_undefined_input`: ir rejects undefined input
- `test_compiler_fuses_gemm_add_relu`: compiler fuses gemm add relu
- `test_compiler_cache_hit`: compiler cache hit
- `test_gemm_matches_numpy`: gemm matches numpy
- `test_attention_matches_reference`: attention matches reference
- `test_conv2d_matches_naive`: conv2d matches naive
- `test_reduce_ops`: reduce ops
- `test_softmax_is_numerically_stable`: softmax is numerically stable
- `test_text_to_mlp_end_to_end`: text to mlp end to end
- `test_deterministic_run_repeatable`: deterministic run repeatable
- `test_registry_and_future_backends_are_honest`: registry and future backends are honest
- `test_gpu_backend_is_real_but_honest_without_hardware`: The gpu backend is a genuine torch implementation, not a stub. Without a CUDA device it reports unavailable and raises a clear, hardware-honest error (naming the missing device) instead of faking GPU compute on the Digital GPU engine.
- `test_gpu_backend_reduce_parity_with_digital_gpu`: reduce() on the gpu backend must match DigitalGPUBackend for all ops and for multi-axis reductions (numpy supports tuple axes; torch's dim does not, so the backend folds them — this guards that parity).
- `test_pdim_dedup_cache_hit`: pdim dedup cache hit
- `test_pdim_single_flight_collapses_concurrent`: pdim single flight collapses concurrent
- `test_pdim_durable_queue_roundtrip`: pdim durable queue roundtrip
- `test_pdim_preview_policy_pluggable`: pdim preview policy pluggable
- `test_batched_gemm_is_engine_served`: batched gemm is engine served
- `test_softmax_any_axis_is_engine_served`: softmax any axis is engine served
- `test_masked_multihead_attention_is_engine_served`: masked multihead attention is engine served
- `test_pocket_matmul_correct_and_deduped_inside_one_pocket`: pocket matmul correct and deduped inside one pocket
- `test_pocket_nesting_pockets_inside_one_pocket_are_isolated`: pocket nesting pockets inside one pocket are isolated
- `test_pocket_matmul_batched_and_shape_errors`: pocket matmul batched and shape errors
- `test_pocket_accelerator_hit_serves_repeat_at_hash_cost`: pocket accelerator hit serves repeat at hash cost
- `test_pocket_accelerator_miss_result_mutation_cannot_poison_cache`: pocket accelerator miss result mutation cannot poison cache
- `test_pocket_accelerator_adaptive_gating`: pocket accelerator adaptive gating
- `test_pocket_accelerator_exposes_measured_admission_costs`: Task-170 step 3: hashing/lookup/copy/storage costs must be measured and exposed, not just implied by hit rate.
- `test_pocket_bucket_admission_uses_measured_breakeven_not_just_hit_rate`: Task-170 step 3: 'admit reusable computations without charging one-shot work more than the compute it protects' — a pocket whose measured hash/lookup/store overhead is comparable to its own measured compute cost must be held to a stricter bar than the flat hit-rate floor, derived from those measured seconds. A pocket whose overhead is cheap relative to its (expensive) compute must NOT be over-muted — the static floor still governs there, unchanged from before.
- `test_pocket_bucket_copy_cost_never_zerodivides_breakeven`: Degenerate edge case: if measured copy cost ever reached or exceeded measured compute+store (never expected for a real GEMM, where copying a result is far cheaper than computing it), the breakeven denominator would hit zero or go negative. `settle()` must skip the posterior adjustment for that call rather than raise ZeroDivisionError, and the pocket must fall back to the static floor, not the crash.
- `test_digital_gpu_gemm_served_from_pocket_on_repeat`: digital gpu gemm served from pocket on repeat

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_precision.py`

Tests for the precision/quantization numerics reference.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_precision.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `test_quant_roundtrip_within_one_step`: quant roundtrip within one step
- `test_int8_per_tensor_matmul_accurate`: int8 per tensor matmul accurate
- `test_int4_per_channel_beats_per_tensor`: int4 per channel beats per tensor
- `test_outliers_saturate_at_clip_boundary`: outliers saturate at clip boundary
- `test_invalid_percentile_raises`: invalid percentile raises
- `test_deterministic`: deterministic

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_resource_plan.py`

Tests for resource_plan.py — the CPU/memory/tile-size planning layer.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_resource_plan.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 15}.

<details>
<summary>What each case checks</summary>

- `test_planned_cpu_count_defaults_to_host`: planned cpu count defaults to host
- `test_planned_cpu_count_override`: planned cpu count override
- `test_planned_memory_bytes_default_is_positive`: planned memory bytes default is positive
- `test_planned_memory_bytes_override`: planned memory bytes override
- `test_effective_blas_threads_reads_own_process_env`: effective blas threads reads own process env
- `test_effective_blas_threads_falls_back_to_reserved_single_stream_plan_when_unset`: effective blas threads falls back to reserved single stream plan when unset
- `test_cache_budget_bytes_floor_and_ceiling`: cache budget bytes floor and ceiling
- `test_cache_budget_bytes_mid_range_is_a_fraction_of_memory`: cache budget bytes mid range is a fraction of memory
- `test_compute_resource_plan_synthetic_4_cpu_dev_profile`: compute resource plan synthetic 4 cpu dev profile
- `test_compute_resource_plan_synthetic_8_cpu_profile`: compute resource plan synthetic 8 cpu profile
- `test_compute_resource_plan_synthetic_16_cpu_production_profile`: compute resource plan synthetic 16 cpu production profile
- `test_compute_resource_plan_defaults_num_streams_to_at_least_one`: compute resource plan defaults num streams to at least one
- `test_gemm_tile_hint_reproduces_current_defaults_on_dev_host_threads`: gemm tile hint reproduces current defaults on dev host threads
- `test_gemm_tile_hint_scales_up_boundedly`: gemm tile hint scales up boundedly
- `test_gemm_tile_hint_handles_degenerate_input`: gemm tile hint handles degenerate input

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_silicon_simt_backend.py`

Correctness tests: SiliconSimtBackend vs. the reference DigitalGPUBackend / NumPy.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/test_silicon_simt_backend.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 18}.

<details>
<summary>What each case checks</summary>

- `test_gemm_matches_reference_small`: gemm matches reference small
- `test_gemm_matches_reference_stft_shape`: Worst-realistic-case shape this backend must serve as the live default.
- `test_gemm_bias_activation_variants`: gemm bias activation variants
- `test_gemm_batched_and_vector_cases`: gemm batched and vector cases
- `test_attention_plain`: attention plain
- `test_attention_causal`: attention causal
- `test_attention_masked`: attention masked
- `test_conv2d_matches_reference`: conv2d matches reference
- `test_conv2d_stride2_no_padding`: conv2d stride2 no padding
- `test_mlp_matches_reference`: mlp matches reference
- `test_softmax_matches_reference_multi_axis`: softmax matches reference multi axis
- `test_reduce_all_ops`: reduce all ops
- `test_add_and_relu`: add and relu
- `test_default_backend_resolves_to_silicon_simt`: default backend resolves to silicon simt
- `test_maxcore_backend_env_restores_legacy_engine`: maxcore backend env restores legacy engine
- `test_explicit_backend_arg_overrides_env`: explicit backend arg overrides env
- `test_registry_lists_silicon_simt`: registry lists silicon simt
- `test_end_to_end_mlp_under_default_backend`: Mirrors a real caller: construct DigitalGPU() with no explicit backend (the default-unset path every confirmed call site uses) and run an op end to end through the facade.

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/model/test_generation_regressions.py`

Small, checkpoint-free regressions for the live generation contracts.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/model/test_generation_regressions.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 12}.

<details>
<summary>What each case checks</summary>

- `AttentionShapeTests.test_real_hypergpu_prefix_and_kv_logits_agree`: real hypergpu prefix and kv logits agree
- `AttentionShapeTests.test_batched_prefill_and_decode_use_per_head_gpu_gemm`: batched prefill and decode use per head gpu gemm
- `AttentionShapeTests.test_gpu_failure_is_not_masked_with_cpu_attention`: gpu failure is not masked with cpu attention
- `GenerationContractTests.test_released_word_vocab_is_not_encoded_as_untrained_bpe`: released word vocab is not encoded as untrained bpe
- `GenerationContractTests.test_script_prompt_bounds_awareness_and_excludes_plan_transport`: script prompt bounds awareness and excludes plan transport
- `GenerationContractTests.test_canonical_awareness_context_is_added_once`: canonical awareness context is added once
- `GenerationContractTests.test_incompatible_tokenizer_and_lost_prompt_are_explicit`: incompatible tokenizer and lost prompt are explicit
- `GenerationContractTests.test_warmup_prompt_selection_uses_only_checkpoint_tokens`: warmup prompt selection uses only checkpoint tokens
- `GenerationContractTests.test_prompt_loss_guard_accepts_exactly_40_percent_and_rejects_more`: prompt loss guard accepts exactly 40 percent and rejects more
- `GenerationContractTests.test_unnamed_checkpoint_head_rows_cannot_decode_as_unknown`: unnamed checkpoint head rows cannot decode as unknown
- `GenerationContractTests.test_only_generated_tokens_are_returned`: only generated tokens are returned
- `GenerationContractTests.test_script_failure_does_not_claim_awareness_as_model_output`: script failure does not claim awareness as model output

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/model/test_sampling_context.py`

Focused request-local replay tests; tiny deterministic logits, no checkpoints.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/model/test_sampling_context.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 7}.

<details>
<summary>What each case checks</summary>

- `SamplingTests.test_replay_without_cache_and_independent_concurrent_rngs`: replay without cache and independent concurrent rngs
- `SamplingTests.test_active_plan_attribute_and_effective_dictionary_seed`: active plan attribute and effective dictionary seed
- `SamplingTests.test_coalesced_rows_do_not_share_random_stream`: coalesced rows do not share random stream
- `SamplingTests.test_cache_identity_and_gpu_errors`: cache identity and gpu errors
- `SamplingTests.test_invalid_seed_rejected`: invalid seed rejected
- `SamplingTests.test_prefix_keys_bind_plan_and_checkpoint`: prefix keys bind plan and checkpoint
- `SamplingTests.test_candidate_native_sampling_replays_concurrently`: candidate native sampling replays concurrently

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_text.py`

test text

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_text.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `test_counts_unicode_paragraphs_and_observed_tokens`: counts unicode paragraphs and observed tokens
- `test_negation_is_auditable_and_inverts_lexical_match`: negation is auditable and inverts lexical match
- `test_empty_text_has_explicit_non_applicable_readability`: empty text has explicit non applicable readability
- `test_repeated_content_changes_keyword_and_ngram_measurements`: repeated content changes keyword and ngram measurements
- `test_non_string_is_rejected_instead_of_coerced`: non string is rejected instead of coerced

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_website.py`

test website

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/test_website.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `test_extracts_actual_document_semantics_and_resolves_urls`: extracts actual document semantics and resolves urls
- `test_visible_text_ignores_script_style_template_and_comments`: visible text ignores script style template and comments
- `test_link_kinds_and_evidence_backed_issues`: link kinds and evidence backed issues
- `test_malformed_html_and_empty_document_return_finite_envelopes`: malformed html and empty document return finite envelopes
- `test_non_string_arguments_are_rejected_without_network_fallback`: non string arguments are rejected without network fallback

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_phase4.py`

Tests for Phase 4 — brand identity centroid, embedding cache, seeded-render dedupe, and the generated-asset ingestor.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_phase4.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 10}.

<details>
<summary>What each case checks</summary>

- `test_brand_centroid_mean`: brand centroid mean
- `test_brand_centroid_replace_matches_rebuild`: brand centroid replace matches rebuild
- `test_brand_centroid_survives_state_roundtrip`: brand centroid survives state roundtrip
- `test_brand_centroid_remove_recomputes`: brand centroid remove recomputes
- `test_embedding_cache_hit_and_copy`: embedding cache hit and copy
- `test_embedding_cache_bypass`: embedding cache bypass
- `test_seeded_render_reuses_file`: seeded render reuses file
- `test_seeded_render_concurrent_dedupe`: seeded render concurrent dedupe
- `test_ingestor_enqueue_dedupe_and_drain`: ingestor enqueue dedupe and drain
- `test_ingestor_bad_path_retries_then_drops`: ingestor bad path retries then drops

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_pipeline.py`

Tests for the retrieval real-asset pipeline (image features + anchor/seed library + gap ingestion). Renders REAL images via the in-house ImageEngine, so it is a slower integration test than test_retrieval.py.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_pipeline.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 8}.

<details>
<summary>What each case checks</summary>

- `test_features_deterministic_and_dim`: features deterministic and dim
- `test_seeded_render_is_idempotent_file`: seeded render is idempotent file
- `test_features_total_on_garbage`: features total on garbage
- `test_ensure_library_idempotent`: ensure library idempotent
- `test_coverage_gate_healthy_after_library`: coverage gate healthy after library
- `test_decode_scheme_valid`: decode scheme valid
- `test_ingest_gaps_adds_real_asset`: ingest gaps adds real asset
- `test_ingest_generated_asset`: ingest generated asset

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_rcgs.py`

Tests for the live RCGS query path: the probe ring buffer, retrieval-conditioned background compositing, and the CoverageWatchdog's context-carrying probe handling.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_rcgs.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 4}.

<details>
<summary>What each case checks</summary>

- `test_probes`: probes
- `test_path_resolution`: path resolution
- `test_condition_background`: condition background
- `test_watchdog_probe_context`: watchdog probe context

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_retrieval.py`

Tests for the retrieval spine (AssetIndex) and the self-healing CoverageWatchdog.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/retrieval/test_retrieval.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 13}.

<details>
<summary>What each case checks</summary>

- `test_cascade_rungs`: cascade rungs
- `test_never_empty_when_nonempty`: never empty when nonempty
- `test_totality`: totality
- `test_determinism`: determinism
- `test_coverage_gate`: coverage gate
- `test_serialization_roundtrip`: serialization roundtrip
- `test_watchdog_heals_missing_anchors`: watchdog heals missing anchors
- `test_watchdog_enqueues_coverage_gaps`: watchdog enqueues coverage gaps
- `test_watchdog_drains_via_ingestion`: watchdog drains via ingestion
- `test_exact_key_replacement`: exact key replacement
- `test_drain_atomic_no_loss`: drain atomic no loss
- `test_drain_requeue_on_failure`: drain requeue on failure
- `test_watchdog_check_isolation`: watchdog check isolation

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/rta/test_render_contracts.py`

Regression tests for the RTA-1 fabric's strict correctness contracts.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/rta/test_render_contracts.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `test_image_bytes_identical_across_processes`: Same inputs → byte-identical image across processes with different hash seeds.
- `test_spectral_tail_reconstruction_non_hop_aligned`: The reconstructed tail of a non-hop-aligned clip is as accurate as the whole.
- `test_fabric_self_test_all_mediums_and_gpu`: All three mediums render and the Digital-GPU GEMM counter increments.

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/test_quality_awareness.py`

Mandatory-awareness compatibility tests; replaces obsolete retirement tests.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/test_quality_awareness.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 12}.

<details>
<summary>What each case checks</summary>

- `FacadeTests.test_missing_snapshot_returns_empty_context_without_blocking`: missing snapshot returns empty context without blocking
- `FacadeTests.test_bound_knowledge_does_not_retire_and_secondary_is_preserved`: bound knowledge does not retire and secondary is preserved
- `FacadeTests.test_own_corpus_retires_external_awareness_at_configured_threshold`: own corpus retires external awareness at configured threshold
- `FacadeTests.test_unavailable_corpus_never_claims_retirement`: unavailable corpus never claims retirement

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/test_ranker_upgrades.py`

test ranker upgrades

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/test_ranker_upgrades.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 13}.

<details>
<summary>What each case checks</summary>

- `ArcAwareLengthTests.test_three_act_body_not_penalized`: three act body not penalized
- `ArcAwareLengthTests.test_thin_caption_still_loses_on_substance`: thin caption still loses on substance
- `SingleAskTests.test_multi_ask_penalized`: multi ask penalized
- `SingleAskTests.test_ask_count`: ask count
- `HookDiversityTests.test_repeat_hook_penalized`: repeat hook penalized
- `HookDiversityTests.test_near_duplicate_hook_penalized`: near duplicate hook penalized
- `KeywordDensityTests.test_stuffed_caption_capped`: stuffed caption capped
- `ScorerGateTests.test_lowercase_hook_penalized`: lowercase hook penalized
- `TopicHygieneTests.test_instruction_fragments_stripped`: instruction fragments stripped
- `TopicHygieneTests.test_real_topic_survives`: real topic survives
- `PlatformResearchTests.test_platform_cta_bonus`: platform cta bonus
- `PlatformResearchTests.test_platform_bonus_influences_ranking`: platform bonus influences ranking
- `ComposeCaptionTests.test_compose_caption_end_to_end`: compose caption end to end

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/test_request_intelligence_trends.py`

test request intelligence trends

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/test_request_intelligence_trends.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `TrendBonusTests.test_trends_fold_into_directives`: trends fold into directives
- `TrendBonusTests.test_bonus_scales_with_hits`: bonus scales with hits
- `TrendBonusTests.test_generic_single_words_do_not_false_positive`: generic single words do not false positive
- `TrendBonusTests.test_bonus_capped_at_five`: bonus capped at five
- `TrendBonusTests.test_no_bonus_without_trend_directives`: no bonus without trend directives
- `TrendBonusTests.test_score_candidate_applies_bonus`: score candidate applies bonus

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate.py`

test candidate

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 9}.

<details>
<summary>What each case checks</summary>

- `CandidateTests.test_byte_complete`: byte complete
- `CandidateTests.test_manifest_controls`: manifest controls
- `CandidateTests.test_fail_closed`: fail closed
- `CandidateTests.test_real_autograd_matches_torch`: real autograd matches torch
- `CandidateTests.test_embedding_tanh_loss_and_sgd`: embedding tanh loss and sgd
- `CandidateTests.test_transformer_causal_and_trainable`: transformer causal and trainable
- `CandidateTests.test_no_native_torch_training_kernels`: no native torch training kernels
- `CandidateTests.test_benchmark_fails_closed_before_inference`: benchmark fails closed before inference
- `CandidateTests.test_attention_and_layernorm_gradients`: attention and layernorm gradients

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_generic.py`

Real bounded runtime evidence tests, NOT synthetic quality-approval fixtures.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_generic.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 2}.

<details>
<summary>What each case checks</summary>

- `GenericCandidateTests.test_actual_manifest_training_registry_and_adapter`: actual manifest training registry and adapter
- `GenericCandidateTests.test_generic_training_rejects_unfrozen_or_tampered_inputs`: generic training rejects unfrozen or tampered inputs

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_manual.py`

test candidate manual

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_candidate_manual.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `CandidateManualTests.test_full_manual_backward_and_update_match_autograd`: full manual backward and update match autograd
- `CandidateManualTests.test_sample_replay_controls_and_no_native_inference`: sample replay controls and no native inference
- `CandidateManualTests.test_sampling_kernel_constraints`: sampling kernel constraints

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/training/test_live_learning.py`

Contract tests cover rolling live-source admission and candidate isolation.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_live_learning.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 21}.

<details>
<summary>What each case checks</summary>

- `LiveLearningTests.test_actual_router_auth_and_validation`: actual router auth and validation
- `LiveLearningTests.test_live_observations_need_no_rights_file_and_do_not_claim_license`: live observations need no rights file and do not claim license
- `LiveLearningTests.test_live_observation_set_trains_every_selected_record`: live observation set trains every selected record
- `LiveLearningTests.test_empty_observation_cache_blocks_without_starting_training`: empty observation cache blocks without starting training
- `LiveLearningTests.test_server_wires_real_admin_and_keeps_write_guard`: server wires real admin and keeps write guard
- `LiveLearningTests.test_status_endpoint_is_authorized_and_does_not_expose_text`: status endpoint is authorized and does not expose text
- `LiveLearningTests.test_invalid_reports_always_fail_closed_and_record_terminal_result`: invalid reports always fail closed and record terminal result
- `LiveLearningTests.test_interrupted_worker_never_passes_registry_and_list_reconciles`: interrupted worker never passes registry and list reconciles
- `LiveLearningTests.test_inherited_worker_lock_defers_reconciliation_until_worker_exit`: inherited worker lock defers reconciliation until worker exit
- `LiveLearningTests.test_concurrent_admission_blocked`: concurrent admission blocked
- `LiveLearningTests.test_timeout_and_failure_are_not_success`: timeout and failure are not success
- `LiveLearningTests.test_real_worker_contract_and_digital_training`: real worker contract and digital training
- `LiveLearningTests.test_worker_has_independent_timeout_and_inherits_global_lock`: worker has independent timeout and inherits global lock

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/training/test_public_content_model.py`

test public content model

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/training/test_public_content_model.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 4}.

<details>
<summary>What each case checks</summary>

- `PublicContentModelTests.test_manual_gradients`: manual gradients
- `PublicContentModelTests.test_causality_checkpoint_sampling`: causality checkpoint sampling
- `PublicContentModelTests.test_bounds`: bounds
- `PublicContentModelTests.test_adamw_matches_reference_and_resumes`: adamw matches reference and resumes

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/video/test_controls.py`

test controls

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/video/test_controls.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 10}.

<details>
<summary>What each case checks</summary>

- `test_real_procedural_clip_decodes`: real procedural clip decodes
- `test_unsupported_video_fails`: unsupported video fails

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/video/test_duration_contract.py`

Cheap duration/transition regression checks; no model or video inference.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/video/test_duration_contract.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 7}.

<details>
<summary>What each case checks</summary>

- `DurationContractTest.test_four_seconds_are_not_promoted_to_three_minimum_scenes`: four seconds are not promoted to three minimum scenes
- `DurationContractTest.test_xfade_budget_and_reported_duration_are_measured`: xfade budget and reported duration are measured
- `DurationContractTest.test_one_frame_short_video_is_not_reported_as_four_seconds`: one frame short video is not reported as four seconds
- `DurationContractTest.test_xfade_filter_has_frame_budget_and_audio_trim`: xfade filter has frame budget and audio trim
- `DurationContractTest.test_real_ffmpeg_video_stream_and_container_are_four_seconds`: Cheap 32px inputs expose final-packet / stream-duration errors.

</details>

### `external/maxcore/artifacts/ai-training-server/ai_model/video/test_sampler_upgrades.py`

test sampler upgrades

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/ai_model/video/test_sampler_upgrades.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 10}.

<details>
<summary>What each case checks</summary>

- `TrimTests.test_trims_at_last_clause_boundary`: trims at last clause boundary
- `TrimTests.test_reported_dangling_cases`: reported dangling cases
- `TrimTests.test_no_dangling_function_word`: no dangling function word
- `TrimTests.test_short_text_untouched`: short text untouched
- `DiversityTests.test_repeated_picks_diversify`: repeated picks diversify
- `DiversityTests.test_recency_penalty_decays`: recency penalty decays
- `ScenePhraseScoreTests.test_placeholder_count_matters`: placeholder count matters
- `ScenePhraseScoreTests.test_one_tap_cta_bonus`: one tap cta bonus
- `ScenePhraseScoreTests.test_arc_markers`: arc markers
- `SampleScenesTests.test_sample_all_scenes_runs`: sample all scenes runs

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_admin_content_loop.py`

test admin content loop

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_admin_content_loop.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `AdminContentLoopTests.test_cycle_uses_available_snapshot_and_feeds_admin_flywheel`: cycle uses available snapshot and feeds admin flywheel
- `AdminContentLoopTests.test_cycle_generates_and_feeds_flywheel_without_any_snapshot`: cycle generates and feeds flywheel without any snapshot
- `AdminContentLoopTests.test_retired_corpus_skips_external_awareness_generation`: retired corpus skips external awareness generation

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_all_endpoints.py`

Direct endpoint verification — tests every route on the model server (port 9878) and the api-server proxy (port 8080) with correct minimal payloads.

Status: **blocked**. Mutates a live model server, including training/admin routes; requires a disposable server and explicit test credentials.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_all_endpoints.py --output /tmp/maxbooster-python-single
```

### `external/maxcore/artifacts/ai-training-server/tests/test_artifact_delivery_contract.py`

Real encoded file checks; isolated receipt transport exercises retry semantics.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_artifact_delivery_contract.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 8}.

<details>
<summary>What each case checks</summary>

- `ArtifactDeliveryTests.test_actual_duration_and_scratch_retained_until_journal_saved`: actual duration and scratch retained until journal saved
- `ArtifactDeliveryTests.test_specification_is_not_media`: specification is not media
- `ArtifactDeliveryTests.test_retry_keeps_identity_and_bytes`: retry keeps identity and bytes
- `ArtifactDeliveryTests.test_wrong_owner_or_digest_never_completes`: wrong owner or digest never completes
- `ArtifactDeliveryTests.test_cancel_does_not_upload`: cancel does not upload
- `ArtifactDeliveryTests.test_manager_saves_receipt_before_cleanup`: manager saves receipt before cleanup
- `ArtifactDeliveryTests.test_cancelled_manager_cannot_publish_and_removes_scratch`: cancelled manager cannot publish and removes scratch
- `ArtifactDeliveryTests.test_interrupted_commit_recovers_without_rendering`: interrupted commit recovers without rendering

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py`

Focused integration checks for audio dataset auto-growth.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_auto_growth.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 7}.

<details>
<summary>What each case checks</summary>

- `TestAutoGrowthStateUpdates.test_state_updated_on_success`: state updated on success
- `TestAutoGrowthStateUpdates.test_counter_increments_across_multiple_seeds`: counter increments across multiple seeds
- `TestRateLimitThrottle.test_throttled_within_interval`: throttled within interval
- `TestRateLimitThrottle.test_not_throttled_after_interval_expires`: not throttled after interval expires
- `TestAlreadySeedingHandled.test_already_seeding_is_graceful`: already seeding is graceful
- `TestAlreadySeedingHandled.test_concurrent_lock_held_no_raise`: Simulate the real lock being held by another thread.
- `TestAboveThresholdSkipped.test_above_threshold_no_seed`: above threshold no seed

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py`

Audio BPM/key match validation — end-to-end + unit tests.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 5, "tests": 30}.

<details>
<summary>What each case checks</summary>

- `TestSelectAudioSample.test_exact_key_match_is_preferred`: When a track with the exact requested key exists it is chosen.
- `TestSelectAudioSample.test_key_match_case_insensitive`: Key comparison is case-insensitive.
- `TestSelectAudioSample.test_no_key_match_returns_false_and_warns`: When no track matches the key, key_matched=False and all tracks are eligible.
- `TestSelectAudioSample.test_empty_key_request_does_not_trigger_fallback`: An empty/None requested key should not be treated as a key to match.
- `TestSelectAudioSample.test_closest_bpm_wins_within_key_pool`: Within key-matched tracks the one with closest BPM is selected.
- `TestSelectAudioSample.test_zero_bpm_in_index_is_deprioritised`: Entries with bpm=0 (estimation failed) rank last on BPM.
- `TestSelectAudioSample.test_zero_bpm_in_index_used_when_only_option`: If ALL entries have bpm=0 the selector still returns one entry.
- `TestSelectAudioSample.test_genre_match_breaks_bpm_tie`: A genre-matching track is preferred over an equally-close BPM track.
- `TestSelectAudioSample.test_genre_match_case_and_hyphen_normalised`: Genre comparison normalises hyphens and case.
- `TestSelectAudioSample.test_no_preferred_genres_ignores_genre_field`: When no preferred genres are given genre_score is always 0 (neutral).
- `TestSelectAudioSample.test_single_entry_index`: single entry index
- `TestSelectAudioSample.test_empty_index_raises`: empty index raises
- `TestSelectAudioSample.test_tiebreak_by_idx`: When genre and BPM are identical, the lower idx wins (deterministic).
- `TestAudioBpmKeyMatchE2E.test_returned_bpm_within_tolerance`: Applied BPM in the response should be within BPM_TOLERANCE of the request.
- `TestAudioBpmKeyMatchE2E.test_key_match_present_in_dataset`: When the dataset contains a track with the requested key, no warning is emitted.
- `TestAudioBpmKeyMatchE2E.test_key_not_in_dataset_surfaces_warning`: When the requested key is absent from the dataset, selection_warning is set.
- `TestAudioBpmKeyMatchE2E.test_source_sample_metadata_present`: Response includes source_sample so producers can audit which track was used.
- `TestAudioBpmKeyMatchE2E.test_audio_file_is_served`: The URL in the response must actually serve a file (HTTP 200).
- `TestGenreNormalization.test_numeric_fma_ids_map_to_names`: numeric fma ids map to names
- `TestGenreNormalization.test_numeric_strings_map_to_names`: numeric strings map to names
- `TestGenreNormalization.test_unknown_ids_kept_as_strings`: unknown ids kept as strings
- `TestGenreNormalization.test_names_lowercased_and_dehyphenated`: names lowercased and dehyphenated
- `TestGenreNormalization.test_awareness_genre_matches_fma_id_track`: awareness genre matches fma id track
- `TestMoodAffinity.test_mood_breaks_tie_toward_affinity`: mood breaks tie toward affinity
- `TestMoodAffinity.test_genre_intent_outranks_mood`: genre intent outranks mood
- `TestMoodAffinity.test_unknown_mood_is_noop`: unknown mood is noop
- `TestMoodAffinity.test_mood_with_numeric_fma_genres`: mood with numeric fma genres
- `TestNormalizeGenresMalformed.test_scalar_string_not_iterated_charwise`: scalar string not iterated charwise
- `TestNormalizeGenresMalformed.test_scalar_int`: scalar int
- `TestNormalizeGenresMalformed.test_none`: none

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_audio_seeding_guard.py`

Tests for the audio-generation seeding guard.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_audio_seeding_guard.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 8}.

<details>
<summary>What each case checks</summary>

- `test_is_seeding_false_when_idle`: is seeding false when idle
- `test_is_seeding_true_while_lock_held`: is seeding true while lock held
- `test_wait_logic_concept`: Verify the wait logic concept: poll until chunk appears or deadline passes. This exercises the same pattern used in _render_audio_from_dataset without importing the full server.
- `test_wait_logic_timeout`: If no chunk appears within the deadline, the loop exits without finding data.
- `test_seeding_now_in_status_response_shape`: _audio_dataset_status() (called by GET /storage/datasets/audio/status) must include a 'seeding_now' field.  We test the function signature by reading the source rather than importing the full server.
- `test_seeding_in_progress_early_exit_present`: Verify that the /api/generate/audio handler contains the early-exit 503 + seeding_in_progress block.
- `test_render_fn_wait_block_present`: Verify _render_audio_from_dataset contains the wait-for-chunk loop.
- `test_is_seeding_probe_is_fast`: is_seeding() must return in well under 1 ms (it's a non-blocking lock try).

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_auto_selection.py`

Selection policy; real signatures and artifact verification covered by integration.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_auto_selection.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 11}.

<details>
<summary>What each case checks</summary>

- `AutomaticSelectionTests.test_best_reviewed_candidate_without_downgrade_or_protocol_swap`: best reviewed candidate without downgrade or protocol swap
- `AutomaticSelectionTests.test_unsigned_submission_cannot_change_selection`: unsigned submission cannot change selection
- `AutomaticSelectionTests.test_public_path_rejects_traditional_mixed_smoke_and_private_sources`: public path rejects traditional mixed smoke and private sources
- `AutomaticSelectionTests.test_new_unusable_candidate_retains_operational_incumbent`: new unusable candidate retains operational incumbent
- `AutomaticSelectionTests.test_durable_root_rejects_relative_or_symlink_paths`: durable root rejects relative or symlink paths

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_auto_selection_scaling.py`

Selector scheduling/cache checks; capability itself keeps real-agent guards.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_auto_selection_scaling.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 9}.

<details>
<summary>What each case checks</summary>

- `SelectionScalingTests.test_newest_beyond_first_hundred_and_peak_only`: newest beyond first hundred and peak only
- `SelectionScalingTests.test_two_new_probes_per_tick_and_cached_failures_progress`: two new probes per tick and cached failures progress
- `SelectionScalingTests.test_fresh_scans_do_not_starve_older_capable_candidate`: fresh scans do not starve older capable candidate
- `SelectionScalingTests.test_cache_binds_checkpoint_report_certificate_configuration_budget`: cache binds checkpoint report certificate configuration budget
- `SelectionScalingTests.test_requested_peak_never_falls_back_to_reviewed_selection`: requested peak never falls back to reviewed selection
- `SelectionScalingTests.test_operational_cache_is_scoped_to_the_actual_live_scan`: operational cache is scoped to the actual live scan
- `SelectionScalingTests.test_missing_scan_is_not_cached_as_a_checkpoint_failure`: missing scan is not cached as a checkpoint failure
- `SelectionScalingTests.test_deadline_interrupts_actual_kernel_generation`: deadline interrupts actual kernel generation
- `SelectionScalingTests.test_retained_returns_only_validated_matching_policy_identity`: retained returns only validated matching policy identity

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_awareness_and_quality.py`

Awareness layer + content quality rating tests — digital GPU integration.

Status: **blocked**. Requires a running generation-capable isolated MaxCore model server; live quality is not established by fixtures.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_awareness_and_quality.py --output /tmp/maxbooster-python-single
```

<details>
<summary>What each case checks</summary>

- `test_awareness_quality_status`: awareness quality status
- `test_awareness_self_sufficiency_formula`: buffer_weight must equal max(0, 1 - own_corpus / retire_threshold).
- `test_awareness_status_fields_types`: awareness status fields types
- `test_awareness_plain_string`: Plain string awareness passes through unchanged.
- `test_awareness_structured_object`: Structured awareness {contextString, trendingGenres} must be normalised by _AwarenessMixin.
- `test_awareness_empty_string_still_works`: Empty awareness must not crash generation.
- `test_awareness_structured_empty_contextstring`: Structured awareness with empty contextString gracefully degrades.
- `test_awareness_instruction_field`: instruction field feeds into awareness_from_direction as [HIGH] signals.
- `test_awareness_content_themes`: content_themes feed into awareness_from_direction as bullet context.
- `test_awareness_extra_context`: extra_context appended after instruction in the awareness pipeline.
- `test_awareness_changes_output`: Same topic and platform with vs. without awareness must not produce identical captions. (Exact match would mean awareness is being ignored.)
- `test_awareness_conditioning_quality_delta`: Awareness-conditioned output must produce valid scored output on both paths. Uses clean ASCII-only awareness strings to avoid unicode token fusion (known edge: non-ASCII chars in awareness can bleed into output and trip the garble guard — see idea-awareness-field-separation in memory).
- `test_plain_awareness_used_and_intent_lines_never_leak`: Regression guards for the intent↔awareness synchronization work: 1. Plain (unprefixed) caller awareness must still influence output even    though the platform quality buffer always supplies [HIGH] signals    (previously the buffer drowned caller lines → awareness was a no-op). 2. Machine-readable [INTENT] key=value lines must NEVER leak verbatim    into user-facing hook/body/cta/caption text.
- `test_awareness_multi_layer_live_signals`: Combined live signals + brand direction produces valid, non-garbled output.
- `test_awareness_across_modalities_social`: awareness across modalities social
- `test_awareness_across_modalities_video`: awareness across modalities video
- `test_awareness_across_modalities_ads`: awareness across modalities ads
- `test_quality_score_valid_range`: score_candidate must return a value in [0, 100] for typical responses.
- `test_quality_no_garbled_output`: No content/generate response should trigger the garbled guard.
- `test_quality_hook_non_empty`: hook field must be a non-empty string on every content/generate call.
- `test_quality_cta_presence`: At least 80% of content responses should include a recognisable CTA.
- `test_quality_viral_score_range`: viral_score must be in [0, 1] for all generated content.
- `test_quality_source_field`: source should be 'model' when HyperGPU is powering inference.
- `test_quality_processing_time_nonzero`: processing_time_ms must be > 0 when model inference ran.
- `test_predict_engagement_viral_potential`: predict engagement viral potential
- `test_predict_engagement_viral_potential_long_hook`: Content with a longer hook should produce higher hook_power → higher viral score.
- `test_predict_engagement_best_time`: predict engagement best time
- `test_predict_engagement_recommend_type`: predict engagement recommend type
- `test_predict_engagement_confidence_range`: confidence must be in [0, 1] for all actions.
- `test_variant_distinctness_social`: Multi-variant social generation: consecutive variants must not be byte-for-byte identical (Jaccard < 1.0).  We accept high lexical overlap at this model training stage — the important signal is that the server is not returning the exact same string for every slot. Ideal target is Jaccard < 0.85; we assert < 1.0 as the hard floor and print a warning when similarity exceeds 0.85 so it shows up in the quality log as a known model-maturity metric.
- `test_variant_distinctness_content_platform`: Same content request across different platforms should yield platform-adapted output.
- `test_platform_tiktok_hook_length`: TikTok hooks under 80 chars achieve hook_power = 1.0. Server formula: hook_power = min(1.0, len(hook)/80). We verify the hook is non-empty and score accordingly.
- `test_platform_instagram_hashtags`: Instagram content with include_hashtags=True must return hashtags.
- `test_platform_youtube_body_length`: YouTube descriptions benefit from longer body copy.
- `test_platform_twitter_brevity`: Twitter/X content should produce a concise output.
- `test_garble_guard_all_platforms`: Run content/generate for 6 platform+topic combos and assert none of the returned captions trigger looks_garbled().
- `test_analyze_returns_intent_confidence`: analyze returns intent confidence
- `test_analyze_url_modality_with_awareness`: analyze url modality with awareness
- `test_awareness_layered_daw`: DAW generation with awareness should produce non-garbled lyric/hook.
- `test_quality_leaderboard_content_types`: Generate one piece across all major content types. Every piece must: score > 0, not garbled, have non-empty hook or caption. Final leaderboard printed in summary.

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_awareness_conditioner.py`

Tests for the expanded AwarenessConditioner vocab.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_awareness_conditioner.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 29}.

<details>
<summary>What each case checks</summary>

- `test_no_duplicates`: no duplicates
- `test_vocab_size_at_least_120`: vocab size at least 120
- `test_new_platforms_in_vocab`: new platforms in vocab
- `test_new_genres_in_vocab`: new genres in vocab
- `test_new_production_terms_in_vocab`: new production terms in vocab
- `test_new_mood_terms_in_vocab`: new mood terms in vocab
- `test_new_visual_terms_in_vocab`: new visual terms in vocab
- `test_amapiano_fires`: amapiano fires
- `test_bluesky_fires`: bluesky fires
- `test_threads_fires`: threads fires
- `test_grime_fires`: grime fires
- `test_synthwave_fires`: synthwave fires
- `test_neon_aesthetic_fires`: neon aesthetic fires
- `test_empty_awareness_is_zero`: empty awareness is zero
- `test_unrecognised_term_is_zero`: A completely novel term not in VOCAB produces no signal (not a crash).
- `test_high_signal_upweights`: high signal upweights
- `test_high_upweight_capped_at_2`: high upweight capped at 2
- `test_output_shape`: output shape
- `test_deterministic`: deterministic
- `test_different_awareness_different_tensor`: different awareness different tensor
- `test_novel_term_shifts_tensor`: Adding a previously-absent vocab term must measurably shift the output.
- `test_platform_term_shifts_tensor`: threads / bluesky (new platforms) must shift the tensor.
- `test_detect_amapiano`: detect amapiano
- `test_detect_city_pop`: detect city pop
- `test_detect_grime`: detect grime
- `test_detect_gospel`: detect gospel
- `test_detect_synthwave`: detect synthwave
- `test_detect_bedroom`: detect bedroom
- `test_explicit_genre_wins`: explicit genre wins

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_beat_context.py`

Beat-marketplace conditioning — regression guards.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_beat_context.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `test_purchase_goal_aliases_to_conversion`: purchase goal aliases to conversion
- `test_beat_context_awareness_lines_parse`: beat context awareness lines parse
- `test_beat_context_never_raises_and_sanitizes`: beat context never raises and sanitizes
- `test_purchase_cta_anchors`: purchase cta anchors
- `test_platform_constraints`: platform constraints

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_campaign_rollout.py`

Real rollout assembly with a controlled inference boundary and public scan.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_campaign_rollout.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 29}.

<details>
<summary>What each case checks</summary>

- `test_unverified_release_keeps_all_slots_without_invented_milestones`: unverified release keeps all slots without invented milestones
- `test_multiplatform_campaign_keeps_normalized_names_and_actual_sections`: multiplatform campaign keeps normalized names and actual sections
- `test_backend_provenance_failure_never_substitutes_complete_template`: backend provenance failure never substitutes complete template
- `test_backend_exception_aborts_whole_campaign_without_leaking_plan`: backend exception aborts whole campaign without leaking plan
- `test_unverified_metrics_links_and_marketing_claims_fail_explicitly`: unverified metrics links and marketing claims fail explicitly
- `test_invalid_campaign_controls_fail_before_any_backend_call`: invalid campaign controls fail before any backend call
- `test_failed_optional_asset_is_explicit_without_inventing_delivery`: failed optional asset is explicit without inventing delivery
- `test_actual_script_agent_runs_under_unique_slot_plans_and_one_public_scan`: actual script agent runs under unique slot plans and one public scan
- `test_specification_or_unsafe_asset_identifiers_never_count_as_generated_images`: specification or unsafe asset identifiers never count as generated images
- `test_expired_inherited_budget_blocks_inference_and_preserves_context`: expired inherited budget blocks inference and preserves context

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_checkpoint_release.py`

test checkpoint release

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_checkpoint_release.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 8}.

<details>
<summary>What each case checks</summary>

- `CheckpointReleaseTests.test_materializes_verified_source_once_even_with_concurrent_preparers`: materializes verified source once even with concurrent preparers
- `CheckpointReleaseTests.test_reuses_lfs_cache_without_rewriting_tracked_pointer`: reuses lfs cache without rewriting tracked pointer
- `CheckpointReleaseTests.test_pointer_only_checkout_is_actionable_and_never_creates_weights`: pointer only checkout is actionable and never creates weights
- `CheckpointReleaseTests.test_bad_active_checkpoint_is_preserved_and_rejected`: bad active checkpoint is preserved and rejected
- `CheckpointReleaseTests.test_supplied_artifact_requires_the_same_release_digest`: supplied artifact requires the same release digest
- `CheckpointReleaseTests.test_manifest_must_bind_to_its_git_pointer`: manifest must bind to its git pointer
- `CheckpointReleaseTests.test_missing_bytes_block_before_model_or_gpu_allocation`: missing bytes block before model or gpu allocation
- `CheckpointReleaseTests.test_verified_archive_loads_complete_tensor_state_for_numerical_execution`: verified archive loads complete tensor state for numerical execution

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_content_endpoints.py`

Content endpoint tests — digital GPU integration.

Status: **blocked**. Requires a running generation-capable isolated MaxCore model server; includes media generation.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_content_endpoints.py --output /tmp/maxbooster-python-single
```

<details>
<summary>What each case checks</summary>

- `test_health`: health
- `test_gpu_hyper_status`: gpu hyper status
- `test_model_status`: model status
- `test_platform_model_info`: platform model info
- `test_content_generate_tiktok`: content generate tiktok
- `test_content_generate_instagram`: content generate instagram
- `test_content_generate_youtube`: content generate youtube
- `test_content_generate_has_processing_time`: content generate has processing time
- `test_platform_social_instagram`: platform social instagram
- `test_platform_social_tiktok_variants`: platform social tiktok variants
- `test_platform_social_twitter`: platform social twitter
- `test_platform_daw_lyrics`: platform daw lyrics
- `test_platform_daw_hook`: platform daw hook
- `test_platform_daw_beat_description`: platform daw beat description
- `test_platform_distribution_plan`: platform distribution plan
- `test_platform_video_youtube`: platform video youtube
- `test_platform_video_tiktok_vertical`: platform video tiktok vertical
- `test_analyze_text`: analyze text
- `test_analyze_text_sentiment`: analyze text sentiment
- `test_analyze_url_modality`: analyze url modality
- `test_generate_text_content_mode`: generate text content mode
- `test_generate_text_planner_mode`: generate text planner mode
- `test_generate_audio`: generate audio
- `test_generate_image`: generate image
- `test_generate_video`: generate video
- `test_ads_generate_meta`: ads generate meta
- `test_ads_generate_tiktok`: ads generate tiktok
- `test_pocket_multiply_2x2`: pocket multiply 2x2
- `test_pocket_multiply_3x3`: pocket multiply 3x3
- `test_pocket_multiply_dedup`: Same operands → second call should be served from cache.
- `test_pocket_accelerator_stats`: pocket accelerator stats
- `test_social_autopilot`: social autopilot

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_dedicated_handler_routing.py`

Handler/legacy body contracts, distinct from real media route admission.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_dedicated_handler_routing.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 23}.

<details>
<summary>What each case checks</summary>

- `test_ads_meta_uses_social_awareness_but_keeps_network_identity`: ads meta uses social awareness but keeps network identity
- `test_ad_script_uses_agent_run_and_exposes_source`: ad script uses agent run and exposes source
- `test_ad_script_failure_is_not_disguised_as_template`: ad script failure is not disguised as template
- `test_ad_awareness_fallback_is_not_claimed_as_generated`: ad awareness fallback is not claimed as generated
- `test_campaign_passes_platform_specific_awareness_to_builder`: campaign passes platform specific awareness to builder
- `test_studio_soundtrack_deadline_covers_admission_and_render`: studio soundtrack deadline covers admission and render
- `test_internal_model_and_health_listeners_are_loopback_only`: internal model and health listeners are loopback only
- `test_requested_pathtrace_passes_subject_and_rejects_unsupported`: requested pathtrace passes subject and rejects unsupported
- `test_soundtrack_passes_genre_mood_and_intent_to_isolated_renderer`: soundtrack passes genre mood and intent to isolated renderer
- `test_dataset_audio_reports_bytes_and_targets_not_invented_measurements`: dataset audio reports bytes and targets not invented measurements
- `test_model_script_guard_rejects_template_and_awareness`: model script guard rejects template and awareness
- `test_generic_content_rejects_stale_cached_awareness`: generic content rejects stale cached awareness
- `test_api_content_rejects_cached_fake_score`: api content rejects cached fake score
- `test_api_text_rejects_legacy_cached_score`: api text rejects legacy cached score
- `test_api_content_fresh_copy_is_model_text_without_fake_scores`: api content fresh copy is model text without fake scores
- `test_alias_media_bodies_mark_asset_identifiers_as_specs`: alias media bodies mark asset identifiers as specs
- `test_unavailable_model_media_routes_never_enter_legacy_render_or_create_jobs`: unavailable model media routes never enter legacy render or create jobs
- `test_audio_explicit_direction_reaches_synth_and_avoids_genre_pool`: audio explicit direction reaches synth and avoids genre pool
- `test_audio_synth_receives_actual_instrument_and_prompt`: audio synth receives actual instrument and prompt
- `test_audio_reference_body_rejects_unfulfillable_piano_direction`: audio reference body rejects unfulfillable piano direction
- `test_audio_internal_body_caller_mood_and_targets_beat_fast_priors`: audio internal body caller mood and targets beat fast priors
- `test_daw_and_social_model_failures_are_service_unavailable`: daw and social model failures are service unavailable

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_dedicated_media_http.py`

Real procedural artifacts through actual ASGI admission and private delivery.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_dedicated_media_http.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 15}.

<details>
<summary>What each case checks</summary>

- `DedicatedMediaHTTP.test_real_image_audio_video_artifacts_without_language_checkpoint`: real image audio video artifacts without language checkpoint
- `DedicatedMediaHTTP.test_raw_video_alias_runs_the_same_explicit_procedural_contract`: raw video alias runs the same explicit procedural contract
- `DedicatedMediaHTTP.test_normal_learned_media_and_text_still_require_a_capable_candidate`: normal learned media and text still require a capable candidate
- `DedicatedMediaHTTP.test_missing_or_stale_awareness_never_dispatches_a_renderer`: missing or stale awareness never dispatches a renderer
- `DedicatedMediaHTTP.test_semantic_controls_and_unrelated_routes_cannot_select_procedural_success`: semantic controls and unrelated routes cannot select procedural success
- `DedicatedMediaHTTP.test_real_private_owner_middleware_blocks_spoofed_or_missing_identity`: real private owner middleware blocks spoofed or missing identity
- `DedicatedMediaHTTP.test_video_audio_references_are_resolved_only_for_the_private_owner`: video audio references are resolved only for the private owner
- `DedicatedMediaHTTP.test_video_muxes_a_real_owner_upload_but_rejects_other_owner_and_symlink`: video muxes a real owner upload but rejects other owner and symlink

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_diffusion_frame_resolution.py`

Regression guard: get_diffusion_frame must denoise at native resolution.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_diffusion_frame_resolution.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `test_output_matches_requested_dimensions`: output matches requested dimensions
- `test_generate_called_at_native_resolution`: The heavy generate() must receive resolution=RESOLUTION, never max(w,h).
- `test_hi_res_request_stays_fast`: A 1920-tall request must cost ~native-res time (was ~28s pre-fix).

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_documented_stack_restore.py`

Offline stack contracts: no server startup, storage, weights, or training.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_documented_stack_restore.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 20}.

<details>
<summary>What each case checks</summary>

- `test_executor_propagates_isolated_request_context`: executor propagates isolated request context
- `test_executor_cancellation_waits_for_actual_worker_exit`: executor cancellation waits for actual worker exit
- `test_literal_direction_composes_real_model_without_claiming_raw_provenance`: literal direction composes real model without claiming raw provenance
- `test_awareness_prompt_does_not_invent_checkpoint_special_tokens`: awareness prompt does not invent checkpoint special tokens
- `test_prompt_keeps_user_words_and_punctuation_without_fabricated_suffixes`: prompt keeps user words and punctuation without fabricated suffixes
- `test_composition_provenance_allowed_but_templates_still_rejected`: composition provenance allowed but templates still rejected
- `test_planner_routes_all_documented_modalities_without_claiming_model`: planner routes all documented modalities without claiming model
- `test_planner_topic_shorthand_retains_request_and_builds_real_slot`: planner topic shorthand retains request and builds real slot
- `test_social_profile_identity_reaches_inference_without_fabricated_fetch`: social profile identity reaches inference without fabricated fetch
- `test_profile_identity_never_turns_private_or_post_urls_into_claimed_content`: profile identity never turns private or post urls into claimed content
- `test_video_checkpoint_unavailable_maps_to_503_not_500`: video checkpoint unavailable maps to 503 not 500
- `test_model_failure_never_runs_awareness_template_substitute`: model failure never runs awareness template substitute
- `test_private_supervisor_auth_requires_secret_and_loopback`: private supervisor auth requires secret and loopback
- `test_render_worker_owns_gpu_until_it_returns`: render worker owns gpu until it returns

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_generation_capability.py`

Operational admission executes real agent guards without training fixtures.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_generation_capability.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 10}.

<details>
<summary>What each case checks</summary>

- `GenerationCapabilityTests.test_missing_awareness_is_retryable_and_never_probes_an_unconditioned_model`: missing awareness is retryable and never probes an unconditioned model
- `GenerationCapabilityTests.test_rejects_empty_garble_metadata_and_missing_sections`: rejects empty garble metadata and missing sections
- `GenerationCapabilityTests.test_real_agent_accepts_complete_generated_sections_and_preserves_context`: real agent accepts complete generated sections and preserves context
- `GenerationCapabilityTests.test_unusable_public_selected_model_cannot_report_active_release`: unusable public selected model cannot report active release
- `GenerationCapabilityTests.test_a_scan_refresh_between_cases_cannot_change_the_pinned_probe`: a scan refresh between cases cannot change the pinned probe

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_generation_durable_delivery.py`

Real WAV commit validation; synthetic awareness and renderer fixtures, no quality claim.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_generation_durable_delivery.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 18}.

<details>
<summary>What each case checks</summary>

- `DeliveryTests.test_actual_invalid_compact_image_control_is_terminal_failed`: actual invalid compact image control is terminal failed
- `DeliveryTests.test_renderer_failure_cleans_only_its_owned_partial_scratch`: renderer failure cleans only its owned partial scratch
- `DeliveryTests.test_delivery_failure_stays_committing_and_preserves_rendered_bytes`: delivery failure stays committing and preserves rendered bytes
- `DeliveryTests.test_restart_marks_running_failed_without_rerender_or_unsafe_cleanup`: restart marks running failed without rerender or unsafe cleanup
- `DeliveryTests.test_http_private_node_header_contract_against_actual_middleware`: http private node header contract against actual middleware
- `DeliveryTests.test_private_identity_requires_exact_channel_and_actual_loopback`: private identity requires exact channel and actual loopback
- `DeliveryTests.test_commit_journal_then_cleanup_and_delivery_only_recovery`: commit journal then cleanup and delivery only recovery
- `DeliveryTests.test_cancelled_job_never_calls_transport`: cancelled job never calls transport
- `DeliveryTests.test_successful_delivery_does_not_delete_unowned_renderer_cache`: successful delivery does not delete unowned renderer cache

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_generation_plan_contract.py`

Offline handler-contract tests. No server startup, media render or weight access.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_generation_plan_contract.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 12}.

<details>
<summary>What each case checks</summary>

- `GenerationPlanTests.test_immutable_nested_data_and_stable_hash`: immutable nested data and stable hash
- `GenerationPlanTests.test_invalid_plan_and_real_text_validation`: invalid plan and real text validation
- `GenerationPlanTests.test_job_cache_identity_includes_all_plan_context`: job cache identity includes all plan context
- `GenerationPlanTests.test_handler_context_lifecycle_and_spec_honesty`: handler context lifecycle and spec honesty
- `GenerationPlanTests.test_handler_failure_does_not_retry_or_manufacture_copy`: handler failure does not retry or manufacture copy
- `GenerationPlanTests.test_dedicated_handler_preserves_exact_controls`: dedicated handler preserves exact controls
- `GenerationPlanTests.test_actual_entry_points_are_wrapped`: actual entry points are wrapped
- `GenerationPlanTests.test_actual_api_handlers_dispatch_dedicated_controls`: actual api handlers dispatch dedicated controls
- `GenerationPlanTests.test_render_manager_recovers_journals_and_uses_verified_owner`: render manager recovers journals and uses verified owner
- `GenerationPlanTests.test_dedicated_handler_requires_authenticated_owner`: dedicated handler requires authenticated owner
- `GenerationPlanTests.test_reviewed_candidate_allows_current_sampling_pipeline`: reviewed candidate allows current sampling pipeline
- `GenerationPlanTests.test_candidate_context_error_cannot_be_swallowed_into_template_success`: candidate context error cannot be swallowed into template success

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_generation_release_selection.py`

Startup selection tests, with no model initialization/training or server start.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_generation_release_selection.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 8}.

<details>
<summary>What each case checks</summary>

- `ReleaseSelectionTests.test_default_and_no_selection_leave_explicit_legacy_release`: default and no selection leave explicit legacy release
- `ReleaseSelectionTests.test_live_mode_requires_a_certified_live_run_and_never_legacy_weights`: live mode requires a certified live run and never legacy weights
- `ReleaseSelectionTests.test_selected_adapter_always_requires_review_and_exclusive_policy`: selected adapter always requires review and exclusive policy
- `ReleaseSelectionTests.test_invalid_selected_startup_never_falls_back_and_fails_readiness`: invalid selected startup never falls back and fails readiness
- `ReleaseSelectionTests.test_release_metadata_comes_from_current_adapter_not_greedy_constants`: release metadata comes from current adapter not greedy constants
- `ReleaseSelectionTests.test_adapter_preserves_current_stochastic_sampling_parameters`: adapter preserves current stochastic sampling parameters
- `ReleaseSelectionTests.test_actual_context_limit_rejects_full_prompt_without_compute`: actual context limit rejects full prompt without compute
- `ReleaseSelectionTests.test_blocked_selected_release_health_remains_liveness`: blocked selected release health remains liveness

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_generation_restart_reconciliation.py`

Exercise registered startup handlers with isolated on-disk production journals.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_generation_restart_reconciliation.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 11}.

<details>
<summary>What each case checks</summary>

- `RestartTests.test_registered_startup_reconciles_legacy_without_touching_delivery_or_owners`: registered startup reconciles legacy without touching delivery or owners
- `RestartTests.test_delivery_outage_keeps_journal_bytes_and_allows_later_delivery_only_retry`: delivery outage keeps journal bytes and allows later delivery only retry
- `RestartTests.test_dedicated_interrupt_and_completed_cleanup_are_ownership_scoped`: dedicated interrupt and completed cleanup are ownership scoped
- `RestartTests.test_gc_retains_retryable_manager_delivery_but_expires_terminal_jobs`: gc retains retryable manager delivery but expires terminal jobs
- `RestartTests.test_readiness_requires_both_model_and_fresh_awareness`: readiness requires both model and fresh awareness
- `RestartTests.test_invalid_journal_names_rejected_before_reconciliation_or_delivery`: invalid journal names rejected before reconciliation or delivery
- `RestartTests.test_terminal_gc_retries_failed_owned_unlink_before_deleting_journal`: terminal gc retries failed owned unlink before deleting journal
- `RestartTests.test_terminal_gc_never_deletes_unowned_or_symlink_scratch`: terminal gc never deletes unowned or symlink scratch

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_generation_route_bindings.py`

Exercise production gates without importing server's background daemons.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_generation_route_bindings.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 17}.

<details>
<summary>What each case checks</summary>

- `RouteBindings.test_main_generation_conditions_on_live_snapshot_even_with_large_corpus`: main generation conditions on live snapshot even with large corpus
- `RouteBindings.test_raw_dictionary_nested_alias_calls_acquire_once`: raw dictionary nested alias calls acquire once
- `RouteBindings.test_http_request_body_media_runs_without_snapshot_gate`: http request body media runs without snapshot gate
- `RouteBindings.test_missing_snapshot_does_not_gate_generation_but_bad_request_does`: missing snapshot does not gate generation but bad request does
- `RouteBindings.test_stream_and_thread_keep_snapshot_and_fail_before_headers`: stream and thread keep snapshot and fail before headers
- `RouteBindings.test_async_job_uses_fresh_saved_scan_and_continues_after_expiry`: async job uses fresh saved scan and continues after expiry
- `DirectContracts.test_request_schema_preserves_seed_and_complete_additive_context`: request schema preserves seed and complete additive context
- `DirectContracts.test_installed_batching_accepts_sampling_api_and_retains_plan`: installed batching accepts sampling api and retains plan
- `DirectContracts.test_actual_batch_worker_preserves_each_row_and_partitions_snapshots`: actual batch worker preserves each row and partitions snapshots
- `DirectContracts.test_selected_adapter_generates_without_awareness_snapshot`: selected adapter generates without awareness snapshot
- `DirectContracts.test_stream_adapter_retains_snapshot_when_consumed_later`: stream adapter retains snapshot when consumed later
- `DirectContracts.test_agents_require_generation_plan_but_not_snapshot_before_model_use`: agents require generation plan but not snapshot before model use
- `DirectContracts.test_agent_runs_with_plan_when_scan_is_unavailable`: agent runs with plan when scan is unavailable
- `DirectContracts.test_agent_sampling_and_full_context_reach_actual_model_call`: agent sampling and full context reach actual model call
- `DirectContracts.test_defaults_only_use_measured_absent_compatible_controls`: defaults only use measured absent compatible controls
- `DirectContracts.test_all_generation_and_ad_aliases_are_decorated`: all generation and ad aliases are decorated
- `DirectContracts.test_serving_checkpoint_writes_reject_explicitly`: serving checkpoint writes reject explicitly

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_generation_snapshot_contract.py`

Focused immutable plan and fail-closed binding regressions.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_generation_snapshot_contract.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `SnapshotContractTests.test_direct_plan_is_valid_without_awareness_snapshot`: direct plan is valid without awareness snapshot
- `SnapshotContractTests.test_invalid_and_empty_snapshots_rejected`: invalid and empty snapshots rejected
- `SnapshotContractTests.test_snapshot_checkpoint_and_facts_change_identity`: snapshot checkpoint and facts change identity
- `SnapshotContractTests.test_explicit_seed_and_invalid_seed`: explicit seed and invalid seed
- `SnapshotContractTests.test_binding_cleanup_after_error`: binding cleanup after error
- `SnapshotContractTests.test_context_copy_retains_exact_snapshot`: context copy retains exact snapshot

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_incremental_candidate_inference.py`

Incremental v2 inference must preserve full causal computation, not its tape.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_incremental_candidate_inference.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 11}.

<details>
<summary>What each case checks</summary>

- `IncrementalCandidateInferenceTests.test_every_position_matches_full_causal_and_independent_reference`: every position matches full causal and independent reference
- `IncrementalCandidateInferenceTests.test_context_boundary_and_cache_model_ownership`: context boundary and cache model ownership
- `IncrementalCandidateInferenceTests.test_interleaved_caches_are_isolated`: interleaved caches are isolated
- `IncrementalCandidateInferenceTests.test_generation_determinism_concurrency_and_legacy_path`: generation determinism concurrency and legacy path
- `IncrementalCandidateInferenceTests.test_seeded_sampling_matches_original_full_prefix_computation`: seeded sampling matches original full prefix computation
- `IncrementalCandidateInferenceTests.test_deadline_rejects_output_without_poisoning_next_request`: deadline rejects output without poisoning next request

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_intent_url_reader_safe_http.py`

test intent url reader safe http

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_intent_url_reader_safe_http.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 2}.

<details>
<summary>What each case checks</summary>

- `test_read_url_uses_bounded_safe_transport`: read url uses bounded safe transport
- `test_read_url_explicitly_rejects_unsafe_safe_http_result`: read url explicitly rejects unsafe safe http result

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_isolated_audio.py`

Tiny fake native functions exercise real process isolation, never rendering.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_isolated_audio.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `IsolationTests.test_terminal_job_states_cannot_be_overwritten`: terminal job states cannot be overwritten
- `IsolationTests.test_success_promotes_only_completed_artifact`: success promotes only completed artifact
- `IsolationTests.test_error_invalid_result_and_missing_artifact_cleanup`: error invalid result and missing artifact cleanup
- `IsolationTests.test_native_hang_is_killed_and_slot_reusable`: native hang is killed and slot reusable
- `IsolationTests.test_cancellation_terminates_worker`: cancellation terminates worker
- `IsolationTests.test_sigkill_reclaims_uncooperative_descendant`: sigkill reclaims uncooperative descendant

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_live_awareness_planner_http.py`

Real ASGI planner requests without server startup, weights or provider calls.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_live_awareness_planner_http.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 16}.

<details>
<summary>What each case checks</summary>

- `LiveAwarenessPlannerHTTP.test_multimodal_planner_uses_fresh_awareness_without_model`: multimodal planner uses fresh awareness without model
- `LiveAwarenessPlannerHTTP.test_api_planner_alias_keeps_one_snapshot_and_caller_request`: api planner alias keeps one snapshot and caller request
- `LiveAwarenessPlannerHTTP.test_actual_content_modes_remain_unavailable_without_capable_model`: actual content modes remain unavailable without capable model
- `LiveAwarenessPlannerHTTP.test_missing_or_expired_awareness_does_not_become_planner_success`: missing or expired awareness does not become planner success
- `LiveAwarenessPlannerHTTP.test_planner_preserves_validation_and_cannot_dispatch_render_controls`: planner preserves validation and cannot dispatch render controls
- `LiveAwarenessPlannerHTTP.test_actual_route_dependencies_still_require_generation_authentication`: actual route dependencies still require generation authentication

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_live_serving.py`

test live serving

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_live_serving.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 16}.

<details>
<summary>What each case checks</summary>

- `LiveServingTests.test_fresh_observations_train_but_cannot_promote_themselves`: fresh observations train but cannot promote themselves
- `LiveServingTests.test_selected_release_activates_even_while_training_is_on_cooldown`: selected release activates even while training is on cooldown
- `LiveServingTests.test_restart_and_timestamp_only_refresh_do_not_retrain_same_content`: restart and timestamp only refresh do not retrain same content
- `LiveServingTests.test_restart_reports_retained_candidate_while_cooling_down`: restart reports retained candidate while cooling down
- `LiveServingTests.test_interrupted_attempt_cannot_be_reported_as_success_after_restart`: interrupted attempt cannot be reported as success after restart
- `LiveServingTests.test_blocked_training_rights_remains_honest_across_restart_and_cooldown`: blocked training rights remains honest across restart and cooldown
- `LiveServingTests.test_failed_worker_keeps_durable_cooldown_and_retries_later`: failed worker keeps durable cooldown and retries later
- `LiveServingTests.test_bad_selected_update_retains_the_previous_verified_model`: bad selected update retains the previous verified model
- `LiveServingTests.test_observation_failure_does_not_stop_loading_reviewed_releases`: observation failure does not stop loading reviewed releases
- `LiveServingTests.test_two_owners_cannot_train_concurrently`: two owners cannot train concurrently
- `LiveServingTests.test_stop_prevents_new_training_and_activation`: stop prevents new training and activation
- `LiveServingTests.test_inflight_requests_and_executor_threads_pin_the_old_release`: inflight requests and executor threads pin the old release
- `LiveServingTests.test_runtime_only_adapter_is_never_activated`: runtime only adapter is never activated
- `LiveServingTests.test_default_startup_uses_live_pipeline_without_legacy_checkpoint`: default startup uses live pipeline without legacy checkpoint
- `LiveServingTests.test_expanded_context_is_stored_loaded_and_used_without_truncation`: expanded context is stored loaded and used without truncation
- `LiveServingTests.test_expanded_context_real_manual_training_survives_reload`: expanded context real manual training survives reload

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_live_serving_integration.py`

Real training and cryptographic selection in a disposable test-only registry.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_live_serving_integration.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `LiveServingIntegrationTests.test_observations_train_certify_review_select_and_generate`: observations train certify review select and generate
- `LiveServingIntegrationTests.test_public_observations_train_but_unusable_generation_is_not_selected`: public observations train but unusable generation is not selected

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_local_canonical_storage.py`

Private local PDIM transport contracts; no real service or SQLite opened.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_local_canonical_storage.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 4}.

<details>
<summary>What each case checks</summary>

- `test_canonical_missing_value_never_replays_stale_local_copy`: canonical missing value never replays stale local copy
- `test_canonical_failure_is_explicit_not_sqlite_success`: canonical failure is explicit not sqlite success
- `test_local_secret_cannot_be_sent_to_stale_external_origin`: local secret cannot be sent to stale external origin
- `test_raw_owner_wire_protocol_over_loopback_http`: Exercise real trusted transport against the owner's raw JSON protocol.

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_media_delivery_contract.py`

Isolated tests: no server startup, model loading, network, or live data.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_media_delivery_contract.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 21}.

<details>
<summary>What each case checks</summary>

- `RetryTests.test_transient_retry_then_success`: transient retry then success
- `RetryTests.test_exhaustion_is_terminal`: exhaustion is terminal
- `RetryTests.test_deterministic_failure_not_retried`: deterministic failure not retried
- `RetryTests.test_invalid_artifact_deadline_and_cancellation`: invalid artifact deadline and cancellation
- `CheckpointTests.test_serving_model_retains_training_checkpoint_head_key`: serving model retains training checkpoint head key
- `CheckpointTests.test_archive_loader_is_weights_only_and_validates_root`: archive loader is weights only and validates root
- `CheckpointTests.test_quarantine_preserves_existing_candidate_and_records_provenance`: quarantine preserves existing candidate and records provenance
- `CheckpointTests.test_quarantine_never_deletes_colliding_provenance`: quarantine never deletes colliding provenance
- `CheckpointTests.test_watchdog_does_not_quarantine_operational_load_failure_or_raw_state`: watchdog does not quarantine operational load failure or raw state
- `CheckpointTests.test_watchdog_quarantines_semantically_unusable_checkpoint`: watchdog quarantines semantically unusable checkpoint
- `CheckpointTests.test_complete_and_prefixed`: complete and prefixed
- `CheckpointTests.test_missing_shape_and_unexpected_rejected`: missing shape and unexpected rejected
- `AudioTests.test_xfade_maps_required_audio_explicitly`: xfade maps required audio explicitly
- `AudioTests.test_probe_rejects_silent_and_short_artifacts`: probe rejects silent and short artifacts
- `AudioTests.test_narration_and_soundtrack_failure_propagate`: narration and soundtrack failure propagate
- `ManifestTests.test_all_ten_images_reach_ordered_scene_references`: all ten images reach ordered scene references
- `ManifestTests.test_manifest_validation`: manifest validation
- `ManifestTests.test_measured_audio_onsets`: measured audio onsets
- `ManifestTests.test_manifest_controls_reach_scenes`: manifest controls reach scenes
- `ManifestTests.test_ten_real_images_condition_pixels`: ten real images condition pixels
- `ManifestTests.test_logo_is_composited_into_real_pixels`: logo is composited into real pixels

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_media_learning.py`

test media learning

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_media_learning.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 24}.

<details>
<summary>What each case checks</summary>

- `MediaLearningTests.test_valid_corpus_is_not_claimed_decodable_or_trainable`: valid corpus is not claimed decodable or trainable
- `MediaLearningTests.test_rights_must_be_explicit_and_current`: rights must be explicit and current
- `MediaLearningTests.test_mutation_and_source_leakage_rejected`: mutation and source leakage rejected
- `MediaLearningTests.test_duplicate_content_rejected`: duplicate content rejected
- `MediaLearningTests.test_normalized_observation_overlap_rejected_across_splits`: normalized observation overlap rejected across splits
- `MediaLearningTests.test_guard_never_trains_or_changes_files`: guard never trains or changes files
- `MediaLearningTests.test_invalid_corpus_returns_explicit_blocker`: invalid corpus returns explicit blocker
- `MediaLearningTests.test_routes_require_admin_before_preflight`: routes require admin before preflight
- `MediaLearningTests.test_routes_supported_modalities_return_full_blocked_report`: routes supported modalities return full blocked report
- `MediaLearningTests.test_post_validates_only_operator_configured_corpus`: post validates only operator configured corpus
- `MediaLearningTests.test_post_without_root_is_explicitly_blocked`: post without root is explicitly blocked

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_native_analysis_api.py`

test native analysis api

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_native_analysis_api.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `test_text_requires_generation_auth_and_trusted_owner`: text requires generation auth and trusted owner
- `test_real_image_upload_is_owner_scoped_then_consumed`: real image upload is owner scoped then consumed
- `test_upload_rejects_mime_size_and_invalid_decode`: upload rejects mime size and invalid decode
- `test_body_actor_is_ignored`: body actor is ignored
- `test_expired_upload_is_rejected_and_removed`: expired upload is rejected and removed
- `test_capacity_is_rejected_without_queuing`: capacity is rejected without queuing

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_native_analysis_safe_http.py`

test native analysis safe http

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_native_analysis_safe_http.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 14}.

<details>
<summary>What each case checks</summary>

- `test_rejects_non_public_and_non_http_urls`: rejects non public and non http urls
- `test_dns_answer_is_rejected_if_any_address_is_private`: dns answer is rejected if any address is private
- `test_rejects_ipv6_transition_addresses`: rejects ipv6 transition addresses
- `test_redirect_target_is_validated_again`: redirect target is validated again
- `test_host_header_brackets_ipv6_and_uses_scheme_default_port`: host header brackets ipv6 and uses scheme default port

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_native_awareness_cascade.py`

Regression coverage for awareness at native MaxCore consumer seams.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_native_awareness_cascade.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 13}.

<details>
<summary>What each case checks</summary>

- `test_native_request_models_preserve_structured_and_direction_context`: native request models preserve structured and direction context
- `test_social_route_delivers_structured_envelope_to_agents`: social route delivers structured envelope to agents
- `test_live_report_payload_conditions_real_agent_without_metadata_leak`: live report payload conditions real agent without metadata leak
- `test_real_agent_honors_exact_opening_wording`: real agent honors exact opening wording
- `test_real_agent_honors_structured_must_include_list`: real agent honors structured must include list
- `test_max_knowledge_assistant_remains_local_exempt_source`: max knowledge assistant remains local exempt source
- `test_daw_agents_receive_effective_awareness`: daw agents receive effective awareness
- `test_distribution_agent_receives_effective_awareness`: distribution agent receives effective awareness
- `test_audio_job_identity_contains_effective_awareness`: audio job identity contains effective awareness
- `test_platform_video_coalescer_uses_consumed_awareness`: platform video coalescer uses consumed awareness
- `test_campaign_script_backend_receives_canonical_slot_and_caller_awareness`: campaign script backend receives canonical slot and caller awareness

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_native_media_analysis.py`

test native media analysis

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_native_media_analysis.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `test_png_and_jpeg_have_content_dependent_pixel_measurements`: png and jpeg have content dependent pixel measurements
- `test_generated_mp4_uses_real_probe_frames_and_transition_evidence`: generated mp4 uses real probe frames and transition evidence
- `test_invalid_local_media_errors_are_typed`: invalid local media errors are typed

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_original_quality_runner.py`

Offline, lightweight contract tests for the original quality runner.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_original_quality_runner.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 9}.

<details>
<summary>What each case checks</summary>

- `RunnerContractTests.test_local_origin_only`: local origin only
- `RunnerContractTests.test_hashes_match_unchanged_sources`: hashes match unchanged sources
- `RunnerContractTests.test_counters_exclude_text_and_do_not_subtract_booleans`: counters exclude text and do not subtract booleans
- `RunnerContractTests.test_subprocess_failure_and_timeout_are_recorded`: subprocess failure and timeout are recorded

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_platform_awareness_wiring.py`

test platform awareness wiring

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_platform_awareness_wiring.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 2}.

<details>
<summary>What each case checks</summary>

- `test_api_content_awareness_bus_contains_shared_platform_profile_once`: api content awareness bus contains shared platform profile once
- `test_awareness_bus_rejects_platforms_outside_the_closed_set`: awareness bus rejects platforms outside the closed set

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_public_fetch_proxy.py`

test public fetch proxy

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_public_fetch_proxy.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `PublicFetchProxyTests.test_explicit_proxy_tunnels_the_validated_ip_and_never_leaks_proxy_auth`: explicit proxy tunnels the validated ip and never leaks proxy auth
- `PublicFetchProxyTests.test_https_keeps_original_sni_and_certificate_verification`: https keeps original sni and certificate verification
- `PublicFetchProxyTests.test_proxy_cannot_bypass_public_address_validation`: proxy cannot bypass public address validation
- `PublicFetchProxyTests.test_proxy_dns_answer_cannot_introduce_a_private_or_transition_address`: proxy dns answer cannot introduce a private or transition address
- `PublicFetchProxyTests.test_invalid_proxy_origin_is_rejected`: invalid proxy origin is rejected

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_public_peak_curriculum.py`

Actual bounded public-content training; fixtures never claim model quality.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_public_peak_curriculum.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 11}.

<details>
<summary>What each case checks</summary>

- `PublicPeakCurriculumTests.test_real_isolated_v2_updates_resume_weights_optimizer_and_cursor`: real isolated v2 updates resume weights optimizer and cursor
- `PublicPeakCurriculumTests.test_unknown_rights_peak_posts_block_before_worker_and_preserve_awareness`: unknown rights peak posts block before worker and preserve awareness
- `PublicPeakCurriculumTests.test_legacy_mode_cannot_train_unknown_rights_raw_peak_posts`: legacy mode cannot train unknown rights raw peak posts
- `PublicPeakCurriculumTests.test_peak_training_rights_never_infer_license_from_public_metadata`: peak training rights never infer license from public metadata
- `PublicPeakCurriculumTests.test_explicit_owned_licensed_manifest_still_trains_real_weights`: explicit owned licensed manifest still trains real weights
- `PublicPeakCurriculumTests.test_stage_supervision_preserves_exact_words_and_requires_real_cta`: stage supervision preserves exact words and requires real cta
- `PublicPeakCurriculumTests.test_bootstrap_replays_fresh_content_with_durable_budget_then_changed_only`: bootstrap replays fresh content with durable budget then changed only
- `PublicPeakCurriculumTests.test_missing_peak_content_never_falls_back_to_context`: missing peak content never falls back to context
- `PublicPeakCurriculumTests.test_refresh_reuses_validated_peak_adapter_without_reloading_probes`: refresh reuses validated peak adapter without reloading probes
- `PublicPeakCurriculumTests.test_waiting_peak_selector_does_not_load_old_context_pointer`: waiting peak selector does not load old context pointer
- `PublicPeakCurriculumTests.test_iterative_ancestry_exceeds_128_and_rejects_cycles`: iterative ancestry exceeds 128 and rejects cycles

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_safe_feed_xml.py`

test safe feed xml

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_safe_feed_xml.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `SafeFeedXMLTests.test_rss_and_atom`: rss and atom
- `SafeFeedXMLTests.test_rejects_dtd_entities_and_encoded_variants`: rejects dtd entities and encoded variants
- `SafeFeedXMLTests.test_bounded_structure_and_bytes`: bounded structure and bytes

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_sast_runtime_remediation.py`

Focused regression tests for runtime SAST remediations.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_sast_runtime_remediation.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 12}.

<details>
<summary>What each case checks</summary>

- `PrefixCacheFormatTests.test_tensor_payload_round_trip_including_bfloat16`: tensor payload round trip including bfloat16
- `PrefixCacheFormatTests.test_legacy_payload_is_rejected_without_deleting_state`: legacy payload is rejected without deleting state
- `PrefixCacheFormatTests.test_exact_prompt_key_covers_suffix_shape_dtype_and_model_state`: exact prompt key covers suffix shape dtype and model state
- `PrefixCacheFormatTests.test_over_256_token_cached_result_matches_uncached_result`: over 256 token cached result matches uncached result
- `ProcessErrorBoundaryTests.test_custom_exception_graph_is_reduced_to_builtin_text`: custom exception graph is reduced to builtin text
- `LoadBaseValidationTests.test_accepts_only_http_origins`: accepts only http origins

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_scoped_batch_admission.py`

Model admission belongs to executing work, not queued callers or caches.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_scoped_batch_admission.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `test_batch_admitted_once_and_snapshots_actual_scoped_execution`: batch admitted once and snapshots actual scoped execution
- `test_batch_failure_is_explicit_and_never_unscoped_retry`: batch failure is explicit and never unscoped retry
- `test_disabled_batching_still_scopes_actual_model`: disabled batching still scopes actual model

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_script_byte_budget.py`

Token-unit boundary tests; no generated prose fixtures or fallback output.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_script_byte_budget.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 4}.

<details>
<summary>What each case checks</summary>

- `ScriptByteBudgetTests.test_full_utf8_prompt_and_caption_budget`: full utf8 prompt and caption budget
- `ScriptByteBudgetTests.test_script_boundary_passes_declared_budget_unchanged`: script boundary passes declared budget unchanged
- `ScriptByteBudgetTests.test_legacy_boundary_keeps_eighty_word_budget`: legacy boundary keeps eighty word budget
- `ScriptByteBudgetTests.test_actual_v2_kernels_generate_beyond_smoke_limit`: actual v2 kernels generate beyond smoke limit

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_smoke_load.py`

Smoke load test — Digital GPU (HyperGPU) edition ================================================= Target: 90,000,000 unique requests — 100% success, GPU confirmed on every generation wave, throughput sampled and projected to 90M scale.

Status: **blocked**. Live concurrent generation/load benchmark requires an isolated generation-capable model server.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_smoke_load.py --output /tmp/maxbooster-python-single
```

### `external/maxcore/artifacts/ai-training-server/tests/test_social_ad_beacon.py`

Social + advertising quality beacon — regression guards.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_social_ad_beacon.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `test_signal_lines_parse_into_actionable_signals`: signal lines parse into actionable signals
- `test_no_unsupported_tier_tokens`: no unsupported tier tokens
- `test_tag_sanitization`: tag sanitization

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_social_generation_controls.py`

test social generation controls

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_social_generation_controls.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 12}.

<details>
<summary>What each case checks</summary>

- `test_pydantic_schema_accepts_every_social_url_ui_control`: pydantic schema accepts every social url ui control
- `test_platform_endpoint_schema_inherits_the_real_control_contract`: platform endpoint schema inherits the real control contract
- `test_verified_first_party_context_enters_native_social_awareness`: verified first party context enters native social awareness
- `test_pydantic_schema_rejects_unsupported_controls`: pydantic schema rejects unsupported controls
- `test_native_consumer_applies_length_cta_and_hashtag_controls`: native consumer applies length cta and hashtag controls
- `test_trending_strategy_returns_only_explicitly_evidenced_tags`: trending strategy returns only explicitly evidenced tags
- `test_native_script_agent_consumes_audience_format_length_and_cta`: native script agent consumes audience format length and cta
- `test_url_parser_fetches_public_url_and_extracts_real_title`: url parser fetches public url and extracts real title
- `test_url_parser_refuses_ssrf_target_without_fetching`: url parser refuses ssrf target without fetching

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_text_training_rights.py`

Operator receipts bind test-authored posts; no source permissions are inferred.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_text_training_rights.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 37}.

<details>
<summary>What each case checks</summary>

- `TextTrainingRightsTests.test_exact_operator_grants_attach_bound_receipts_without_relabeling_awareness`: exact operator grants attach bound receipts without relabeling awareness
- `TextTrainingRightsTests.test_missing_either_operator_configuration_value_cannot_grant_permission`: missing either operator configuration value cannot grant permission
- `TextTrainingRightsTests.test_receipts_supplied_as_record_metadata_are_not_operator_configuration`: receipts supplied as record metadata are not operator configuration
- `TextTrainingRightsTests.test_manifest_and_evidence_mutations_fail_closed`: manifest and evidence mutations fail closed
- `TextTrainingRightsTests.test_source_domain_citation_and_complete_text_must_match`: source domain citation and complete text must match
- `TextTrainingRightsTests.test_permission_license_purpose_and_dated_evidence_are_required`: permission license purpose and dated evidence are required
- `TextTrainingRightsTests.test_invalid_batches_never_partially_attach_receipts`: invalid batches never partially attach receipts
- `TextTrainingRightsTests.test_duplicate_grants_and_oversized_manifest_are_refused`: duplicate grants and oversized manifest are refused
- `TextTrainingRightsTests.test_ambiguous_or_excessively_nested_json_fails_closed`: ambiguous or excessively nested json fails closed
- `TextTrainingRightsTests.test_evidence_cannot_escape_local_directory_or_use_symlinks`: evidence cannot escape local directory or use symlinks
- `TextTrainingRightsTests.test_symlink_directories_and_writable_evidence_are_refused`: symlink directories and writable evidence are refused
- `TextTrainingRightsTests.test_private_record_is_not_licensed_by_a_matching_public_receipt`: private record is not licensed by a matching public receipt
- `TextTrainingRightsTests.test_admission_persists_receipts_in_hash_bound_input_without_running_trainer`: admission persists receipts in hash bound input without running trainer

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_trusted_http.py`

Offline trust-boundary tests for configured service HTTP.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_trusted_http.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `TrustedHTTPTests.test_local_only_rejects_non_loopback`: local only rejects non loopback
- `TrustedHTTPTests.test_local_only_rejects_if_any_dns_answer_is_not_loopback`: local only rejects if any dns answer is not loopback
- `TrustedHTTPTests.test_request_cannot_leave_configured_origin`: request cannot leave configured origin
- `TrustedHTTPTests.test_redirect_is_rejected_without_following`: redirect is rejected without following
- `TrustedHTTPTests.test_private_configured_origin_is_pinned_and_preserved`: private configured origin is pinned and preserved

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_unavailable_inference_contracts.py`

Contract guards for MaxCore capabilities that have no real model yet.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_unavailable_inference_contracts.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 7}.

<details>
<summary>What each case checks</summary>

- `test_missing_audio_and_video_inference_never_synthesizes_results`: missing audio and video inference never synthesizes results
- `test_audio_endpoints_use_real_waveform_conductor`: audio endpoints use real waveform conductor
- `test_audio_upload_contract_is_bounded_owner_scoped_and_validated`: audio upload contract is bounded owner scoped and validated
- `test_real_conductor_analyzes_tiny_waveform`: real conductor analyzes tiny waveform
- `test_text_content_mode_never_returns_template_fallback`: text content mode never returns template fallback
- `test_model_readiness_reports_terminal_initialization_failure`: model readiness reports terminal initialization failure
- `test_every_job_reader_enforces_durable_owner`: every job reader enforces durable owner

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_url_label_garble_guard.py`

Unit tests for the URL-parser label-echo garble guard.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_url_label_garble_guard.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 48}.

<details>
<summary>What each case checks</summary>

- `TestLabelEchoDetected.test_artist_label_line`: Artist: <name> at line start is a metadata echo.
- `TestLabelEchoDetected.test_title_label_line`: title label line
- `TestLabelEchoDetected.test_genre_label_line`: genre label line
- `TestLabelEchoDetected.test_intent_label_line`: intent label line
- `TestLabelEchoDetected.test_source_label_line`: source label line
- `TestLabelEchoDetected.test_album_label_line`: album label line
- `TestLabelEchoDetected.test_context_label_line`: context label line
- `TestLabelEchoDetected.test_bpm_key_year_labels`: bpm key year labels
- `TestLabelEchoDetected.test_tier_high_source_line`: [HIGH] Source: … is the awareness header format.
- `TestLabelEchoDetected.test_tier_marker_alone`: tier marker alone
- `TestLabelEchoDetected.test_med_tier_marker`: med tier marker
- `TestLabelEchoDetected.test_low_tier_marker`: low tier marker
- `TestLabelEchoDetected.test_full_awareness_block_echo`: Reproduces the exact format from _build_awareness_text().
- `TestLabelEchoDetected.test_mixed_caption_with_label`: Even one label line in an otherwise fine caption should be caught.
- `TestLabelEchoDetected.test_case_insensitive_label`: Labels must be detected regardless of capitalisation.
- `TestMidLineLabelEchoDetected.test_caption_ending_in_pipe_mood_fragment`: caption ending in pipe mood fragment
- `TestMidLineLabelEchoDetected.test_midline_bpm_key_fragment`: midline bpm key fragment
- `TestMidLineLabelEchoDetected.test_midline_fragment_case_insensitive`: midline fragment case insensitive
- `TestMidLineLabelEchoDetected.test_midline_label_never_whitelisted`: midline label never whitelisted
- `TestLegitimateCaptionNotFlagged.test_artist_name_in_prose`: Mentioning 'Drake' naturally is fine.
- `TestLegitimateCaptionNotFlagged.test_artist_name_whitelisted`: With the artist in the whitelist, name in a caption is clean.
- `TestLegitimateCaptionNotFlagged.test_title_in_prose`: title in prose
- `TestLegitimateCaptionNotFlagged.test_source_word_in_prose`: 'source' as a common English word should not trigger the guard.
- `TestLegitimateCaptionNotFlagged.test_context_word_in_prose`: context word in prose
- `TestLegitimateCaptionNotFlagged.test_key_word_in_prose`: key word in prose
- `TestLegitimateCaptionNotFlagged.test_year_word_in_prose`: year word in prose
- `TestLegitimateCaptionNotFlagged.test_genre_word_in_prose`: genre word in prose
- `TestLegitimateCaptionNotFlagged.test_intent_word_in_prose`: intent word in prose
- `TestLegitimateCaptionNotFlagged.test_pipes_in_ordinary_prose_not_flagged`: Pipes with non-awareness labels are normal event-flyer prose.
- `TestLegitimateCaptionNotFlagged.test_pipe_separated_prose_without_labels`: pipe separated prose without labels
- `TestLegitimateCaptionNotFlagged.test_normal_instagram_caption`: normal instagram caption
- `TestLegitimateCaptionNotFlagged.test_spotify_tiktok_mention`: spotify tiktok mention
- `TestLegitimateCaptionNotFlagged.test_label_word_mid_sentence`: 'Artist:' must only be caught at line boundaries, not mid-sentence.
- `TestGuardCoversAllEmittedLabels.test_awareness_builder_emits_expected_baseline`: Sanity: the builder still emits the known core labels — if this fails, the extraction regex or the builder changed shape.
- `TestGuardCoversAllEmittedLabels.test_every_emitted_label_triggers_guard`: THE cross-check: each emitted label prefix, alone at line start, must be flagged by looks_garbled.
- `TestGuardCoversAllEmittedLabels.test_every_emitted_label_triggers_guard_midline`: Drift guard for the mid-line matcher: every emitted awareness label must also be caught when it appears pipe-preceded mid-line, so _MIDLINE_LABEL_RE can't fall out of sync with _URL_LABEL_RE when new fields are added to _build_awareness_text().
- `TestGuardCoversAllEmittedLabels.test_full_emitted_block_triggers_guard`: The verbatim awareness block itself must always be flagged.
- `TestGarbleReason.test_label_echo_reason`: label echo reason
- `TestGarbleReason.test_tier_marker_reason`: tier marker reason
- `TestGarbleReason.test_glue_tokens_reason`: glue tokens reason
- `TestGarbleReason.test_clean_text_empty_reason`: clean text empty reason
- `TestGarbleReason.test_looks_garbled_consistency`: looks_garbled must be exactly bool(garble_reason) for any input.
- `TestGarbleReason.test_whitelist_respected_for_glue_but_not_labels`: whitelist respected for glue but not labels
- `TestGuardLogsWarning.test_ranking_penalty_logs_reason`: ranking penalty logs reason
- `TestGuardLogsWarning.test_script_agent_suppression_logs_reason`: When the model 'output' echoes awareness labels, ScriptAgent must reject the candidate AND log the reason at WARNING level.
- `TestGuardLogsWarning.test_distribution_agent_suppression_logs_reason`: distribution agent suppression logs reason
- `TestGuardLogsWarning.test_distribution_agent_rejects_structured_control_keys`: distribution agent rejects structured control keys
- `TestGuardLogsWarning.test_distribution_agent_preserves_meaningful_caption_and_sampling_identity`: distribution agent preserves meaningful caption and sampling identity

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_veo_parity.py`

Veo-parity feature guards: image conditioning, cinematography fusion, multi-sample seeds, and the /api/video/extend endpoint contract.

Status: **blocked**. Live video/image generation parity suite targets fixed model port 9878 and requires operational generation.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_veo_parity.py --output /tmp/maxbooster-python-single
```

<details>
<summary>What each case checks</summary>

- `test_sdedit_decodes_init_frame_and_never_raises`: sdedit decodes init frame and never raises
- `test_build_scenes_routes_frames_and_cinematography`: build scenes routes frames and cinematography
- `test_build_scenes_backward_compatible_when_no_veo_params`: build scenes backward compatible when no veo params
- `test_sample_count_returns_distinct_seeded_jobs`: sample count returns distinct seeded jobs
- `test_extend_requires_idea_and_real_source`: extend requires idea and real source

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_voiceover.py`

Voice-over synthesis regression tests (Task: birdcall narration fix).

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_voiceover.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 13}.

<details>
<summary>What each case checks</summary>

- `TestCleanVoText.test_strips_emoji_hashtags_urls_tokens`: strips emoji hashtags urls tokens
- `TestCleanVoText.test_empty_and_symbol_only`: empty and symbol only
- `TestNarratorControls.test_valid_voices_pass_through`: valid voices pass through
- `TestNarratorControls.test_invalid_voices_fall_back`: invalid voices fall back
- `TestNarratorControls.test_valid_wpm_pass_through`: valid wpm pass through
- `TestNarratorControls.test_invalid_wpm_fall_back`: invalid wpm fall back
- `TestSynthesizeVoiceover.test_produces_speech_at_pipeline_rate`: produces speech at pipeline rate
- `TestSynthesizeVoiceover.test_non_default_voice_and_pace`: non default voice and pace
- `TestSynthesizeVoiceover.test_invalid_voice_and_pace_still_render`: invalid voice and pace still render
- `TestSynthesizeVoiceover.test_empty_text_returns_false`: empty text returns false
- `TestMixAndTrack.test_voice_dominates_ducked_music`: voice dominates ducked music
- `TestMixAndTrack.test_voiceover_track_end_to_end`: voiceover track end to end
- `TestMixAndTrack.test_missing_requested_music_never_returns_narration_as_success`: missing requested music never returns narration as success

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_voiceover_api.py`

API-level regression tests: the voice-over flag must be strictly opt-in.

Status: **skipped**.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_voiceover_api.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 6, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `TestGenerateVideoEndpoint.test_voiceover_omitted_is_off`: voiceover omitted is off
- `TestGenerateVideoEndpoint.test_voiceover_false_is_off`: voiceover false is off
- `TestGenerateVideoEndpoint.test_voiceover_true_reported`: voiceover true reported
- `TestGenerateAiEndpoint.test_voiceover_omitted_is_off`: voiceover omitted is off
- `TestGenerateAiEndpoint.test_voiceover_false_is_off`: voiceover false is off
- `TestGenerateAiEndpoint.test_voiceover_true_reported`: voiceover true reported

</details>

### `external/maxcore/artifacts/ai-training-server/tests/test_w6_90m.py`

Wave 6 — throughput proof + content-generation quality verification =================================================================== Section 1 (throughput): models 90,000,000 distinct users each sending their own unique request simultaneously. 150 content-unique requests at 40 concurrent, latency measured and projected to 90M users.

Status: **blocked**. 90M-model throughput and quality benchmark requires an isolated model server and bounded resource budget.

```sh
python3 scripts/testing/run-python-suites.py --file external/maxcore/artifacts/ai-training-server/tests/test_w6_90m.py --output /tmp/maxbooster-python-single
```

### `tests/awareness-public-read-smoke.py`

Read-only live feed check, separate from the no-egress production rehearsal.

Status: **blocked**. Reads live public feeds and needs proxy/TLS networking. Kept outside the no-egress test run.

```sh
python3 scripts/testing/run-python-suites.py --file tests/awareness-public-read-smoke.py --output /tmp/maxbooster-python-single
```

### `tests/chaos/harness.py`

Chaos scenario runner — shared harness.

Status: **blocked**. Shared chaos harness; not standalone tests.

```sh
python3 scripts/testing/run-python-suites.py --file tests/chaos/harness.py --output /tmp/maxbooster-python-single
```

### `tests/chaos/scenarios.py`

Chaos scenarios 1-7: Redis and Postgres failure injection.

Status: **blocked**. Injects Redis/PostgreSQL failures; requires a disposable service topology and explicit fault-injection isolation.

```sh
python3 scripts/testing/run-python-suites.py --file tests/chaos/scenarios.py --output /tmp/maxbooster-python-single
```

### `tests/dns-production-smoke.py`

Exercise the compiled DNS artifact without credentials or network egress.

Status: **blocked**. Requires a new user/network namespace (unshare -Urn) and a current built DNS artifact.

```sh
python3 scripts/testing/run-python-suites.py --file tests/dns-production-smoke.py --output /tmp/maxbooster-python-single
```

### `tests/fsspec-advisories.py`

Real filesystem/template consumers, without network or app database access.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/fsspec-advisories.py --output /tmp/maxbooster-python-single
```

### `tests/npm-start-isolated-smoke.py`

Run under `unshare -Urn` with disposable app and PostgreSQL directories.

Status: **blocked**. Requires disposable production fixture and isolated user/network namespace; never run against the workspace DB.

```sh
python3 scripts/testing/run-python-suites.py --file tests/npm-start-isolated-smoke.py --output /tmp/maxbooster-python-single
```

### `tests/pdim-retained-inventory.py`

Read-only, bounded-memory inventory of retained checkpoint candidates.

Status: **blocked**. Read-only operator inventory of retained state; not an assertion suite and must not read private state in an offline run.

```sh
python3 scripts/testing/run-python-suites.py --file tests/pdim-retained-inventory.py --output /tmp/maxbooster-python-single
```

### `tests/prepare-production-fixture.py`

Prepare disposable production artifacts; never copy workspace credentials/DB data.

Status: **blocked**. Fixture preparation utility, not standalone tests.

```sh
python3 scripts/testing/run-python-suites.py --file tests/prepare-production-fixture.py --output /tmp/maxbooster-python-single
```

### `tests/production-restart-smoke.py`

Two complete start/stop cycles in the same disposable network namespace.

Status: **blocked**. Runs two production start/stop cycles; requires disposable fixture and network namespace.

```sh
python3 scripts/testing/run-python-suites.py --file tests/production-restart-smoke.py --output /tmp/maxbooster-python-single
```

### `tests/production_fixture_support.py`

Safety checks shared by the disposable production rehearsal.

Status: **blocked**. Fixture safety helper module, exercised by test_production_fixture_support.py.

```sh
python3 scripts/testing/run-python-suites.py --file tests/production_fixture_support.py --output /tmp/maxbooster-python-single
```

### `tests/test_ltx_adapter_download.py`

test ltx adapter download

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/test_ltx_adapter_download.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 1}.

<details>
<summary>What each case checks</summary>

- `test_finished_video_has_explicit_bound_and_oversize_is_failure`: finished video has explicit bound and oversize is failure

</details>

### `tests/test_portable_rust_toolchain.py`

Portable compiler verification must fail before an altered compiler is run.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/test_portable_rust_toolchain.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `PortableRustVerification.test_intact_toolchain_checks_exact_versions`: intact toolchain checks exact versions
- `PortableRustVerification.test_altered_or_added_toolchain_file_rejected_before_execution`: altered or added toolchain file rejected before execution
- `PortableRustVerification.test_unpinned_archive_provenance_rejected`: unpinned archive provenance rejected

</details>

### `tests/test_production_fixture_support.py`

test production fixture support

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/test_production_fixture_support.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `FixtureContracts.test_missing_binary_fails_instead_of_skipping`: missing binary fails instead of skipping
- `FixtureContracts.test_prefers_packaged_binary_and_rejects_non_executable`: prefers packaged binary and rejects non executable
- `FixtureContracts.test_listener_is_detected_and_closed_port_passes`: listener is detected and closed port passes

</details>

### `tests/test_secure_http.py`

test secure http

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/test_secure_http.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `SecureHTTPPolicyTests.test_public_policy_rejects_private_address`: public policy rejects private address
- `SecureHTTPPolicyTests.test_loopback_policy_accepts_only_loopback`: loopback policy accepts only loopback
- `SecureHTTPPolicyTests.test_target_must_match_trusted_origin_before_network`: target must match trusted origin before network
- `SecureHTTPPolicyTests.test_custom_schemes_are_rejected`: custom schemes are rejected
- `SecureHTTPPolicyTests.test_redirect_is_refused`: redirect is refused
- `SecureHTTPPolicyTests.test_ipv6_host_header_uses_brackets_and_scheme_default_port`: ipv6 host header uses brackets and scheme default port

</details>

### `tests/test_torch_provenance.py`

Regression tests for the supplemental CPU Torch integrity gate.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/test_torch_provenance.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 2}.

<details>
<summary>What each case checks</summary>

- `ProvenanceTests.test_installed_record_verifies_real_bytes_then_rejects_tampering_and_missing_file`: installed record verifies real bytes then rejects tampering and missing file
- `ProvenanceTests.test_only_unique_official_frozen_wheel_is_accepted`: only unique official frozen wheel is accepted

</details>

### `tests/testing/test_archived_quality_verifiers.py`

Archive integrity must stay distinct from missing current inference evidence.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_archived_quality_verifiers.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `test_completed_archives_validate_without_requiring_obsolete_serving_weights`: completed archives validate without requiring obsolete serving weights
- `test_current_identity_check_fails_when_model_bytes_are_missing`: current identity check fails when model bytes are missing
- `test_incomplete_later_archive_cannot_be_promoted_to_verified_evidence`: incomplete later archive cannot be promoted to verified evidence

</details>

### `tests/testing/test_assertion_oracles.py`

Real pytest must reject false checks in canonical custom assertion helpers.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_assertion_oracles.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 10}.

<details>
<summary>What each case checks</summary>

- `test_false_condition_is_one_real_pytest_assertion_failure`: false condition is one real pytest assertion failure
- `test_true_condition_passes_without_recording_a_failure`: true condition passes without recording a failure

</details>

### `tests/testing/test_launch_readiness_audit.py`

Fail-closed launch decisions and exact inventory/provenance regressions.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_launch_readiness_audit.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 42}.

<details>
<summary>What each case checks</summary>

- `test_missing_quality_domain_is_rejected`: missing quality domain is rejected
- `test_any_nonpassing_domain_prevents_green`: any nonpassing domain prevents green
- `test_full_page_domain_score_cannot_override_production_blocker`: full page domain score cannot override production blocker
- `test_only_complete_conjunction_can_green`: only complete conjunction can green
- `test_all_80_alias_declarations_and_every_section_dimension_retained`: all 80 alias declarations and every section dimension retained
- `test_inventory_loss_or_corruption_is_rejected`: inventory loss or corruption is rejected
- `test_empty_evidence_never_green_even_when_all_source_checks_pass`: empty evidence never green even when all source checks pass
- `test_full_page_criteria_and_global_gap_proofs_do_not_close_missing_exact_section_work`: full page criteria and global gap proofs do not close missing exact section work
- `test_full_producer_can_green_only_with_every_retained_requirement_and_dimension`: full producer can green only with every retained requirement and dimension
- `test_unrouted_backend_and_consumer_work_cannot_disappear_from_green_conjunction`: unrouted backend and consumer work cannot disappear from green conjunction
- `test_stale_evidence_cannot_contribute_to_verified_percentage`: stale evidence cannot contribute to verified percentage
- `test_current_source_hash_paths_digest_and_test_provenance_all_required`: current source hash paths digest and test provenance all required
- `test_passing_test_hash_change_invalidates_source_snapshot`: passing test hash change invalidates source snapshot
- `test_full_repository_manifest_changes_in_sql_and_tests_invalidate_old_proof`: full repository manifest changes in sql and tests invalidate old proof
- `test_regenerated_inventory_does_not_relabel_historical_master_execution`: regenerated inventory does not relabel historical master execution
- `test_custom_input_manifest_binds_selected_actual_files`: custom input manifest binds selected actual files
- `test_criterion_requires_exact_actual_passing_current_test`: criterion requires exact actual passing current test

</details>

### `tests/testing/test_maxcore_analytics.py`

Real authenticated FastAPI contracts for transient MaxCore account analytics.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_maxcore_analytics.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 59}.

<details>
<summary>What each case checks</summary>

- `test_all_routes_require_generation_authorization`: all routes require generation authorization
- `test_capability_advertises_real_methods_without_weights_or_private_retention`: capability advertises real methods without weights or private retention
- `test_exact_linear_calendar_series_has_correct_horizon_and_first_day`: exact linear calendar series has correct horizon and first day
- `test_calendar_gaps_remain_missing_and_do_not_compress_the_regression_axis`: calendar gaps remain missing and do not compress the regression axis
- `test_insufficient_history_never_produces_values_or_a_fake_accuracy`: insufficient history never produces values or a fake accuracy
- `test_noise_produces_finite_widening_residual_intervals_with_explicit_assumptions`: noise produces finite widening residual intervals with explicit assumptions
- `test_zero_constant_and_decreasing_series_stay_finite_nonnegative`: zero constant and decreasing series stay finite nonnegative
- `test_prediction_rejects_invalid_authority_dates_horizons_and_values`: prediction rejects invalid authority dates horizons and values
- `test_overflowing_json_exponent_is_rejected_before_error_serialization`: overflowing json exponent is rejected before error serialization
- `test_insights_report_measured_totals_and_calendar_comparisons_without_causality`: insights report measured totals and calendar comparisons without causality
- `test_empty_and_sparse_insights_do_not_invent_zero_performance`: empty and sparse insights do not invent zero performance
- `test_zero_and_tiny_denominator_comparisons_are_explicit_and_finite`: zero and tiny denominator comparisons are explicit and finite
- `test_insights_enforce_same_bounded_private_aggregate_contract`: insights enforce same bounded private aggregate contract
- `test_public_context_is_separate_fresh_metadata_and_never_receives_private_points`: public context is separate fresh metadata and never receives private points
- `test_missing_invalid_or_expired_public_context_does_not_masquerade_as_fresh`: missing invalid or expired public context does not masquerade as fresh
- `test_snapshot_failure_leaves_statistical_computation_available_and_no_data_is_retained`: snapshot failure leaves statistical computation available and no data is retained
- `test_canonical_server_mounts_router_with_generation_scope_and_read_only_snapshot`: canonical server mounts router with generation scope and read only snapshot

</details>

### `tests/testing/test_platform_evidence.py`

Explicit feature proofs require every exact current passing case.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_platform_evidence.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 25}.

<details>
<summary>What each case checks</summary>

- `test_complete_explicit_bundle_preserves_all_exact_case_identities`: complete explicit bundle preserves all exact case identities
- `test_legacy_single_exact_case_remains_supported`: legacy single exact case remains supported
- `test_one_nonpassing_required_case_rejects_the_entire_bundle`: one nonpassing required case rejects the entire bundle
- `test_changed_platform_source_rejects_otherwise_passing_cases`: changed platform source rejects otherwise passing cases
- `test_changed_test_bytes_reject_old_passing_receipt`: changed test bytes reject old passing receipt
- `test_deleted_test_cannot_be_a_current_proof`: deleted test cannot be a current proof
- `test_static_or_approximate_associations_do_not_close_a_check`: static or approximate associations do not close a check
- `test_malformed_or_empty_bundle_cannot_prove_acceptance`: malformed or empty bundle cannot prove acceptance
- `test_mixed_legacy_and_bundle_identities_are_ambiguous_and_rejected`: mixed legacy and bundle identities are ambiguous and rejected
- `test_duplicate_case_does_not_count_as_two_independent_required_cases`: duplicate case does not count as two independent required cases
- `test_unknown_or_malformed_check_never_becomes_verified`: unknown or malformed check never becomes verified
- `test_unregistered_test_cannot_borrow_an_existing_exact_passing_identity`: unregistered test cannot borrow an existing exact passing identity
- `test_validator_does_not_mutate_the_declared_proof`: validator does not mutate the declared proof

</details>

### `tests/testing/test_platform_plan.py`

Exhaustive ledger preserves aliases, unresolved work and exact evidence states.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_platform_plan.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 7}.

<details>
<summary>What each case checks</summary>

- `test_preserves_all_details_aliases_unrouted_entities_and_original_statuses`: preserves all details aliases unrouted entities and original statuses
- `test_missing_reference_or_template_and_page_deduplication_fail_closed`: missing reference or template and page deduplication fail closed
- `test_emitted_work_validator_detects_lost_details_and_missing_tasks`: emitted work validator detects lost details and missing tasks
- `test_business_sections_bind_exact_pages_and_reject_invented_references`: business sections bind exact pages and reject invented references
- `test_human_output_contains_all_aliases_controls_contracts_and_global_unknowns`: human output contains all aliases controls contracts and global unknowns
- `test_all_page_sections_and_exact_work_dimensions_become_distinct_actions`: all page sections and exact work dimensions become distinct actions
- `test_both_supplement_source_inventory_schemas_detect_stale_analysis`: both supplement source inventory schemas detect stale analysis

</details>

### `tests/testing/test_remediation.py`

Pure-data contracts for the master verification's repair guide.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_remediation.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `test_empty_or_malformed_evidence_cannot_produce_a_closed_strict_run`: empty or malformed evidence cannot produce a closed strict run
- `test_unrecognized_assertion_retains_exact_source_case_and_unconfirmed_cause`: unrecognized assertion retains exact source case and unconfirmed cause
- `test_managed_browser_policy_has_a_supported_remedy_without_an_override`: managed browser policy has a supported remedy without an override
- `test_new_successful_master_audit_supersedes_its_older_failed_snapshot`: new successful master audit supersedes its older failed snapshot
- `test_istanbul_gaps_retain_statement_function_and_branch_locations`: istanbul gaps retain statement function and branch locations
- `test_one_case_diagnosis_does_not_borrow_another_cases_junit_error`: one case diagnosis does not borrow another cases junit error

</details>

### `tests/testing/test_summary_results.py`

Retain every case in mixed Node/Vitest JUnit layouts without double counts.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/testing/test_summary_results.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 6}.

<details>
<summary>What each case checks</summary>

- `test_mixed_root_cases_and_nested_suites_keep_skips_and_each_case_once`: mixed root cases and nested suites keep skips and each case once
- `test_suite_names_and_explicit_file_survive_without_default_file`: suite names and explicit file survive without default file
- `test_master_plan_keeps_sandbox_mutations_opt_in_and_builds_before_http_load`: master plan keeps sandbox mutations opt in and builds before http load
- `test_source_identity_detects_new_code_changes_and_excludes_generated_private_state`: source identity detects new code changes and excludes generated private state
- `test_provider_parse_exclusions_cannot_be_mistaken_for_complete_coverage`: provider parse exclusions cannot be mistaken for complete coverage
- `test_coverage_only_database_cases_are_retained_without_repeating_ordinary_units`: coverage only database cases are retained without repeating ordinary units

</details>

### `tests/urllib3-security-paths.py`

Real loopback streaming regressions, runnable with both app interpreters.

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tests/urllib3-security-paths.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 3}.

<details>
<summary>What each case checks</summary>

- `StreamingSecurityTests.test_patched_import`: patched import
- `StreamingSecurityTests.test_deflate_trailing_bytes_do_not_loop`: deflate trailing bytes do not loop
- `StreamingSecurityTests.test_chunk_size_line_is_bounded`: chunk size line is bounded

</details>

### `tools/sophia-agent-runner/tests/test_sophia.py`

test sophia

Status: **passed**.

```sh
python3 scripts/testing/run-python-suites.py --file tools/sophia-agent-runner/tests/test_sophia.py --output /tmp/maxbooster-python-single
```

JUnit: {"errors": 0, "failures": 0, "skipped": 0, "tests": 5}.

<details>
<summary>What each case checks</summary>

- `TestSophia.test_payload_uses_saved_agent_and_selected_overrides`: payload uses saved agent and selected overrides
- `TestSophia.test_text_response_schema_complete_and_strict_objects`: text response schema complete and strict objects
- `TestSophia.test_sse_multiline_and_final_frame`: sse multiline and final frame
- `TestSophia.test_unknown_tool_returns_error_not_fake_success`: unknown tool returns error not fake success
- `TestSophia.test_url_is_quoted`: url is quoted

</details>
