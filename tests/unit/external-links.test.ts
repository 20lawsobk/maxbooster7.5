import { afterEach, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { sanitizeUrl } from "@/lib/externalLinks";

afterEach(() => vi.restoreAllMocks());

it("rejects malformed external URLs without logging their contents", () => {
  const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  const rejectedUrl = "https://[malformed-contact";

  expect(sanitizeUrl(rejectedUrl)).toBeNull();
  expect(warn).toHaveBeenCalledWith("[ExternalLinks] Invalid URL rejected");
  expect(JSON.stringify(warn.mock.calls)).not.toContain(rejectedUrl);
});
