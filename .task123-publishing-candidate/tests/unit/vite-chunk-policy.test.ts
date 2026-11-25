import { describe, expect, it } from "vitest";
import config from "../../vite.config";

describe("production client chunk classification", () => {
  const manualChunks = config.build?.rollupOptions?.output?.manualChunks;

  it("routes UI, form and telemetry packages away from the core React chunk", () => {
    expect(typeof manualChunks).toBe("function");
    if (typeof manualChunks !== "function") return;

    expect(
      manualChunks("/app/node_modules/@radix-ui/react-dialog/dist/index.js"),
    ).toBe("vendor-ui");
    expect(
      manualChunks("/app/node_modules/react-hook-form/dist/index.esm.js"),
    ).toBe("vendor-forms");
    expect(
      manualChunks("/app/node_modules/@sentry/react/build/esm/index.js"),
    ).toBe("vendor-telemetry");
    expect(manualChunks("/app/node_modules/react/index.js")).toBe(
      "vendor-react",
    );
  });
});
