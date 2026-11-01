# Proposed shared coordinate contract

This read-only analysis found two deliberate raw representations in the installed converter: `Locator.getLoc` sets positive `Infinity` on **end.column** when there is no following generated position for the mapped original end; `CoverageMapper.onBranch` creates a complete location whose four fields are `undefined` for a missing implicit else arm. The first can occur in any location map, not only branches. `pickLocation` preserves those raw values. JSON turns Infinity into null and omits undefined fields, losing their type/origin.

The retained ports replay proves these exact raw types at its recorded paths. It does not prove that arbitrary null/missing coordinates in another JSON file had those origins. In particular, raw NaN also serializes to null, so a JSON roundtrip cannot be a validator or compatibility policy.

`coordinate-contract-proposal.json` specifies a separate strict raw validator, mandatory typed sidecar and wire decoder. Both producers must emit the policy before serialization and retain original runtime/map/source hashes. Old untyped canonical JSON remains historical until recollected or independently supplied with equivalent direct raw evidence; no implicit upgrade or merge is authorized.

The provider differs beyond coordinates: Vitest passes actual module wrapper start offsets, class-method policy and SSR/CJS-specific ignoreNode callbacks. Node currently uses its own bounded proven keepNames policy. Those actual options and all ignored generated AST nodes must be bound to the profile. Coordinate encoding cannot fix genuine additional/missing statements, function declarations or branch arms.

The installed package exposes a custom provider hook and the V8 provider's remapCoverage method. A future adapter can observe the raw return of the existing provider before report serialization, using the package export path pinned in its provenance. It must retain the current denominator, exclusion list, 100% thresholds, test execution and existing provider behavior. This proposal does not modify that configuration or node_modules.

All files here are analysis artifacts under the outside-workspace task directory. The seven validation checks attest only cited source/receipt observations. The proposed codec and its acceptance cases were not implemented or run. No application module was imported, no inference/provider call ran, no code or test changed, and no coverage was merged.
