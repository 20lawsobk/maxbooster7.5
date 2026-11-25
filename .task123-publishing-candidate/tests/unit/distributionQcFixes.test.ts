import { describe, expect, it, vi } from "vitest";
import { applyAllFixableQcChecks } from "../../client/src/lib/distributionQcFixes";

describe("applyAllFixableQcChecks", () => {
  it("requires explicit server confirmation for every successful fix", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: "Corrected" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, message: "Manual correction required" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: true, message: "Rejected by server" }),
      });

    const result = await applyAllFixableQcChecks(
      "release-1",
      [
        { id: "a", status: "failed", fixable: true, fixAction: "fix-a" },
        { id: "b", status: "failed", fixable: true, fixAction: "fix-b" },
        { id: "c", status: "failed", fixable: true, fixAction: "fix-c" },
        { id: "d", status: "passed", fixable: true, fixAction: "skip" },
        { id: "e", status: "failed", fixable: false, fixAction: "skip" },
      ],
      send,
    );

    expect(send).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      attempted: 3,
      succeeded: 1,
      failed: 2,
    });
    expect(result.results.map((attempt) => attempt.success)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("records request failures without claiming success", async () => {
    const send = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const result = await applyAllFixableQcChecks(
      "release-1",
      [{ id: "a", status: "failed", fixable: true, fixAction: "fix-a" }],
      send,
    );

    expect(result).toMatchObject({ attempted: 1, succeeded: 0, failed: 1 });
    expect(result.results[0].message).toBe("network unavailable");
  });

  it("does not call the server when no failed check is fixable", async () => {
    const send = vi.fn();
    const result = await applyAllFixableQcChecks(
      "release-1",
      [{ id: "a", status: "passed", fixable: true, fixAction: "fix-a" }],
      send,
    );

    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    });
  });
});
