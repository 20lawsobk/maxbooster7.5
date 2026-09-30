import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";

function extractRevertHandler() {
  const source = fs.readFileSync("server/routes/admin.ts", "utf8");
  const route = source.indexOf(
    'adminRouter.post("/platform-fixer/patch/:id/revert"',
  );
  if (route < 0) throw new Error("Platform-fixer revert route is not registered");
  const signature = "async (req, res) => {";
  const signatureAt = source.indexOf(signature, route);
  if (signatureAt < 0) throw new Error("Platform-fixer revert handler is missing");
  const open = signatureAt + signature.length - 1;

  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) throw new Error("Platform-fixer revert handler is unterminated");

  // Compile the extracted production handler as TypeScript. This removes only
  // type syntax while preserving its actual await/status/control-flow behavior.
  const body = source.slice(open + 1, close);
  const compiled = transformSync(
    `export async function handler(req: any, res: any, platformAutoFixer: any, logger: any) {${body}}`,
    { loader: "ts", format: "cjs", target: "node22" },
  ).code;
  const module = { exports: {} as Record<string, unknown> };
  // Evaluate the compiled handler in an isolated VM context (avoids the
  // Function constructor while preserving the test's intent).
  const handlerFactory = vm.runInNewContext(
    `(function(module, exports) { ${compiled} })`,
  ) as (module: unknown, exports: unknown) => void;
  handlerFactory(module, module.exports);
  return module.exports.handler as (
    req: unknown,
    res: unknown,
    platformAutoFixer: unknown,
    logger: unknown,
  ) => Promise<void>;
}

function responseMock() {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((status: number) => {
      response.statusCode = status;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

describe("POST /api/admin/platform-fixer/patch/:id/revert", () => {
  it("awaits deferred rollback failure and reports conflict instead of success", async () => {
    const handler = extractRevertHandler();
    let finishRollback!: (result: boolean) => void;
    const deferred = new Promise<boolean>((resolve) => {
      finishRollback = resolve;
    });
    const platformAutoFixer = {
      revertPatch: vi.fn(() => deferred),
    };
    const response = responseMock();

    const pending = handler(
      { params: { id: "patch-deferred" } },
      response,
      platformAutoFixer,
      { warn: vi.fn() },
    );
    await Promise.resolve();

    expect(platformAutoFixer.revertPatch).toHaveBeenCalledWith(
      "patch-deferred",
      "admin request",
    );
    expect(response.json).not.toHaveBeenCalled();

    finishRollback(false);
    await pending;

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error:
        "Patch could not be reverted: it is missing, inactive, or its rollback action failed",
    });
    expect(response.body).not.toEqual({ success: true });
  });
});