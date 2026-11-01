import path from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import {
  attachOwnedPythonProcessLifecycle,
  pythonSpawnSpec,
  resolvePythonExecutable,
} from "../../external/maxcore/artifacts/api-server/src/python-server.js";

describe("MaxCore production Python launcher", () => {
  it("launches the packaged interpreter directly without uv", () => {
    const cwd = "/srv/app";
    const packaged = path.resolve(cwd, "python_runtime/bin/python3");
    const spec = pythonSpawnSpec(
      { NODE_ENV: "production" },
      cwd,
      (candidate) => candidate === packaged,
    );

    expect(spec.command).toBe(packaged);
    expect(spec.command).not.toBe("uv");
    expect(spec.args).toHaveLength(1);
    expect(spec.args[0]).toMatch(/artifacts\/ai-training-server\/server\.py$/);
  });

  it("honors the startup-validated MAXBOOSTER_PYTHON exactly", () => {
    const explicit = "/release/python_runtime/bin/python3";
    expect(
      resolvePythonExecutable(
        { NODE_ENV: "production", MAXBOOSTER_PYTHON: explicit },
        "/ignored",
        (candidate) => candidate === explicit,
      ),
    ).toBe(explicit);
  });

  it("fails closed in production instead of falling back to PATH", () => {
    expect(() =>
      resolvePythonExecutable(
        { NODE_ENV: "production" },
        "/srv/app",
        () => false,
      ),
    ).toThrow(/packaged Python interpreter is unavailable/);

    expect(() =>
      resolvePythonExecutable(
        {
          NODE_ENV: "production",
          MAXBOOSTER_PYTHON: "/missing/python",
        },
        "/srv/app",
        () => false,
      ),
    ).toThrow(/MAXBOOSTER_PYTHON points to a missing interpreter/);
  });

  it("owns asynchronous spawn errors once instead of leaving an unhandled event", () => {
    const child = new EventEmitter();
    const terminations: Array<{
      code: number | null;
      signal: NodeJS.Signals | null;
      error?: Error;
    }> = [];
    attachOwnedPythonProcessLifecycle(child as never, (code, signal, error) => {
      terminations.push({ code, signal, error });
    });

    const enoent = Object.assign(new Error("spawn interpreter ENOENT"), {
      code: "ENOENT",
    });
    child.emit("error", enoent);
    child.emit("exit", 1, null);

    expect(terminations).toEqual([
      { code: null, signal: null, error: enoent },
    ]);
  });
});