import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey?: unknown[] }) => ({
    data:
      queryKey?.[0] === "/api/storefront/templates"
        ? [
            {
              id: "template-without-configuration",
              name: "Template without a saved color palette",
              slug: "template-without-colors",
              description: null,
              previewUrl: null,
              thumbnailUrl: null,
              configuration: null,
              isPremium: false,
              isActive: true,
            },
          ]
        : [],
    isLoading: false,
    isError: false,
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  uploadWithProgress: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "storefront-test-user" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/useOnboardingProgress", () => ({
  useOnboardingProgress: () => ({ trackBeatStoreSetup: vi.fn() }),
}));

import StorefrontBuilder from "../../client/src/components/marketplace/StorefrontBuilder";

describe("StorefrontBuilder empty state", () => {
  it("renders with no delete target and a template without optional color configuration", () => {
    expect(() =>
      renderToStaticMarkup(createElement(StorefrontBuilder)),
    ).not.toThrow();
  });
});
