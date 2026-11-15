# HTTP link digest repair candidate

The completed master on `8a9b638c6c1ce1b46a19501ee4a48893497c2518` correctly rejected nine acceptance-map entries. All 23 exact HTTP case references passed with matching test hashes and current command/log/XML evidence. The nine map entries retained the previous platform digest. Only `package.json` and `vitest.platform.config.ts` changed within the platform digest input inventory between the prior canonical register and this actual full run.

`source.patch` changes only those nine metadata digest fields. It leaves all leaf identities, conjunctive bundles, test hashes, check IDs, tests, validators, command binding, timing checks and production approval rules unchanged. The root map and canonical reports have not been edited. Apply only after final source/config changes; the correct digest must be recalculated if any platform digest input changes again. Once landed the changed common source inputs require a fresh master execution; this candidate recheck does not manufacture current acceptance for that future source.

Reproduce the read-only actual-data recheck while the frozen source and current full master artifacts still match:

```
/workspace/.cloud-python/bin/python -I -B /workspace/onboarding-results/http-links-2026-10-29/recheck.py
```

The script calls the actual repository `collect_current_passing_cases` and `resolve_evidence_cases`, rejects all nine original stale entries, verifies the nine candidate links and all 23 case references, and runs 11 negative controls. The stale-execution control changes the common source input digest and verifies that refreshing the editable platform metadata cannot rescue stale passing results. Other controls reject wrong test hashes, approximate names, wrong groups, unregistered files, missing/failed/skipped required members, duplicate members and unknown checks. The full master also executed the existing platform-evidence regression suite: 83 cases passed, zero failures/errors/skips.

`recheck.json` is a candidate repair observation. It is not a new master, does not replace the original failing register, does not mark any page Green, and grants no production approval. Retain the original full sweep unchanged in its immutable history archive before applying this patch.
