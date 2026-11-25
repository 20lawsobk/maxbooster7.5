---
name: Python test interpreter alignment
description: Keep coverage and test tools compatible with the interpreter that runs instrumented suites.
---

Do not assume Replit's host package environment matches a portable service runtime or the interpreter selected by a test runner. Verify `sys.executable`, the imported module path, Python minor version, and whether the tool depends on a native extension. In this workspace, the managed `.pythonlibs` interpreter is Python 3.14; NumPy's native extension needs Nix `libstdc++` on `LD_LIBRARY_PATH`, and the GPU package initializer eagerly imports Torch even when tests only need the NumPy awareness kernels. Never fall back to uninstrumented tests.

**Why:** Replit-installed coverage was present in the host Python environment but missing from the selected portable runtime, so coverage preflight blocked every suite. Later awareness tests also exposed a managed-runtime native-library gap and an eager Torch import unrelated to the NumPy kernel under test.

**How to apply:** When a runner reports an installed package missing, check interpreter and module provenance first. Install for the selected interpreter, make required Nix runtime libraries visible to that process, or isolate an optional heavyweight package initializer only when the tested production module remains real; preserve ABI constraints for native dependencies.
