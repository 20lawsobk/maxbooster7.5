import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SchedulePostDialog } from "../../client/src/components/social/SchedulePostDialog";

describe("SchedulePostDialog", () => {
  it("renders a new-post dialog when optional edit data is absent", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(SchedulePostDialog, {
          open: true,
          onOpenChange: vi.fn(),
          onSchedule: vi.fn(),
        }),
      ),
    ).not.toThrow();
  });
});
