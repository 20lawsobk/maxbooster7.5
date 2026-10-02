---
name: Capsule build control files
description: Keep publishing dependency metadata outside destructive app capsules.
---

Root dependency manifests and locks must remain available after app-remainder packing, even though most app payload is removed once archived.

**Why:** A publishing attempt successfully built portable Python and the four subsystem capsules, then entered app-remainder packing. A later npm build invocation failed because packing had removed package.json. The logs did not explain why publishing invoked the build again; do not claim a confirmed restart trigger.

**How to apply:** Keep root package-manager metadata outside destructive capsule membership and enforce the restriction at both selection and packing boundaries. Preserve nested package metadata with its actual payload. Test with real packing followed by a real npm command; do not claim that this alone proves a full interrupted build can resume.

Build reentry needs the full pre-pack input set, not just manifests.

**Why:** A subsequent publishing attempt invoked a second build after all four
directory capsules had deleted their sources. Model validation then failed.
Runtime capsules deliberately omit some build-validation inputs, so extracting
only those capsules is insufficient for faithful recovery.

**How to apply:** Keep build-only recovery snapshots outside the shipped image
and restore missing inputs before npm/tsx loads. Preserve later edits and rerun
all validation; never synthesize release metadata or bypass checkpoint checks.
Check actual filesystem types before reusing a scratch-directory name: an
ignored directory pattern does not prove that the existing path is a directory.