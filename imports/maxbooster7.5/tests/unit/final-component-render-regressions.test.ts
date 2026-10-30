import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { ApiKeyManagement } from "../../client/src/components/settings/ApiKeyManagement";

describe("security component and marketplace entry-point regressions", () => {
  it("renders API key management with no selected key and both action dialogs closed", () => {
    // Evaluate JSX in the real component, including closed dialog branches.
    expect(() => renderToStaticMarkup(React.createElement(ApiKeyManagement))).not.toThrow();
  });

  it.each([
    "server/routes/marketplace.ts",
    "client/src/components/settings/ApiKeyManagement.tsx",
    "client/src/components/settings/LoginHistory.tsx",
    "client/src/pages/Distribution.tsx",
    "client/src/pages/Settings.tsx",
  ])("compiles the actual entry point %s, not just its helpers", async (file) => {
    await expect(transform(readFileSync(file, "utf8"), {
      loader: file.endsWith(".tsx") ? "tsx" : "ts",
      format: "esm",
      sourcefile: file,
    })).resolves.toHaveProperty("code");
  });
});