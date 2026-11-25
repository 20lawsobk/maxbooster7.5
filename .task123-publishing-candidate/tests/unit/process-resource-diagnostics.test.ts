import { describe, expect, it } from "vitest";
import { summarizeActiveResourceTypes } from "../../server/services/platformAutoFixer.js";

describe("active resource diagnostics", () => {
  it("counts resource classes without relying on private handle objects", () => {
    expect(summarizeActiveResourceTypes([
      "Timeout",
      "TCPSocketWrap",
      "Timeout",
    ])).toEqual({
      count: 3,
      countsByType: {
        Timeout: 2,
        TCPSocketWrap: 1,
      },
    });
  });
});
