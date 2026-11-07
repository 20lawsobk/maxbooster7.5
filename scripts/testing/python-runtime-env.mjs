import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function resolvePythonRuntime(root, executable, baseEnvironment = process.env) {
  const searchPath = baseEnvironment.PATH || "/usr/bin:/bin";
  const python = executable || baseEnvironment.MAXBOOSTER_TEST_PYTHON ||
    baseEnvironment.MAXBOOSTER_PYTHON || "python3";
  const probe = spawnSync(
    python,
    ["-I", "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
    {
      cwd: root,
      env: { PATH: searchPath, HOME: baseEnvironment.HOME || "/tmp", LANG: "C" },
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  if (probe.error || probe.status !== 0 || !/^\d+\.\d+\n?$/.test(probe.stdout || "")) {
    throw new Error(`Selected Python version could not be resolved: ${probe.error?.message || probe.stderr || "invalid probe result"}`);
  }

  const version = probe.stdout.trim();
  const expectedSitePackages = path.resolve(root, ".pythonlibs", "lib", `python${version}`, "site-packages");
  const sitePackages = path.resolve(baseEnvironment.MAXBOOSTER_PYTHON_SITE_PACKAGES || expectedSitePackages);
  if (sitePackages !== expectedSitePackages || !existsSync(sitePackages)) {
    throw new Error(`Interpreter-matched Python packages are unavailable for Python ${version}`);
  }

  const reportedLibrary = baseEnvironment.MAXBOOSTER_LIBSTDCPP_DIR
    ? path.join(baseEnvironment.MAXBOOSTER_LIBSTDCPP_DIR, "libstdc++.so.6")
    : "";
  let libraryPath = reportedLibrary;
  if (!libraryPath || !existsSync(libraryPath)) {
    const compiler = spawnSync("gcc", ["-print-file-name=libstdc++.so.6"], {
      cwd: root,
      env: { PATH: searchPath, HOME: baseEnvironment.HOME || "/tmp", LANG: "C" },
      encoding: "utf8",
      timeout: 15_000,
    });
    libraryPath = (compiler.stdout || "").trim();
    if (compiler.error || compiler.status !== 0 || !existsSync(libraryPath)) {
      throw new Error(`Compiler runtime libstdc++.so.6 could not be resolved: ${compiler.error?.message || compiler.stderr || "file not found"}`);
    }
  }

  const inheritedLibraryPath = [
    ...(baseEnvironment.REPLIT_PYTHON_LD_LIBRARY_PATH || "").split(path.delimiter),
    ...(baseEnvironment.LD_LIBRARY_PATH || "").split(path.delimiter),
  ].filter(Boolean);
  const ldLibraryPath = [...new Set([path.dirname(path.resolve(libraryPath)), ...inheritedLibraryPath])].join(path.delimiter);
  return { executable: python, sitePackages, ldLibraryPath };
}

export function createPythonChildEnvironment(runtime, baseEnvironment = {}) {
  return {
    PATH: baseEnvironment.PATH || "/usr/bin:/bin",
    HOME: baseEnvironment.HOME || "/tmp",
    LANG: baseEnvironment.LANG || "C",
    PYTHONPATH: runtime.sitePackages,
    LD_LIBRARY_PATH: runtime.ldLibraryPath,
    ...(baseEnvironment.TZ ? { TZ: baseEnvironment.TZ } : {}),
  };
}
