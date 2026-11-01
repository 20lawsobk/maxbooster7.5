import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { StudioStartHub } from "../../client/src/components/studio/StudioStartHub";

describe("Studio project query failure", () => {
  it("renders recovery instead of dereferencing absent project data", () => {
    const html = renderToStaticMarkup(React.createElement(StudioStartHub, { onProjectSelect: vi.fn(), onCreateProject: vi.fn() }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load Studio projects");
    expect(html).toContain("Retry");
  });
});
