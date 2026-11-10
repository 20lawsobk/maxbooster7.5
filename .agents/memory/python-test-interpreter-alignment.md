---
name: Python test interpreter alignment
description: Keep coverage and test tools compatible with the interpreter that runs instrumented suites.
---

Do not assume Replit's host package environment matches a portable service runtime or the interpreter selected by a test runner. Verify `sys.executable`, the imported module path, Python minor version, and whether the tool depends on a native extension. Never fall back to uninstrumented tests.

**Why:** Replit-installed coverage was present in the host Python environment but missing from the selected portable runtime, so coverage preflight blocked every suite. A verified pure-Python coverage installation worked in the selected runtime; future runs should keep the test toolchain and interpreter aligned.

**How to apply:** When a runner reports an installed package missing, check interpreter and module provenance first. Install for the selected interpreter or use a compatible pure-Python tool only after verifying that combination; preserve ABI constraints for native dependencies.
