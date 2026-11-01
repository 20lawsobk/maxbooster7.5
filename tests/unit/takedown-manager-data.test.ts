import { describe, expect, it } from "vitest";
import {
  displayDate,
  displayValue,
  extractDistributionRows,
  type DmcaStrikeRow,
  type RoyaltyDisputeRow,
} from "../../client/src/components/distribution/takedownData";

describe("takedown manager distribution response handling", () => {
  it("extracts the named rows from each distribution envelope", () => {
    const strike: DmcaStrikeRow = {
      id: "strike-1",
      contentType: "audio",
      contentId: "track-1",
      reason: "copyright",
      createdAt: "2026-01-02T03:04:05.000Z",
      expiresAt: null,
    };
    const dispute: RoyaltyDisputeRow = {
      id: "dispute-1",
      type: "original",
      status: "open",
      subject: "strike-1",
      description: "The work is original.",
      evidenceCount: 2,
      createdAt: "2026-01-03T03:04:05.000Z",
      updatedAt: "2026-01-03T03:04:05.000Z",
    };

    expect(
      extractDistributionRows<DmcaStrikeRow>(
        { takedowns: [strike], total: 1 },
        "takedowns",
      ),
    ).toEqual([strike]);
    expect(
      extractDistributionRows<DmcaStrikeRow>(
        { claims: [strike], total: 1 },
        "claims",
      ),
    ).toEqual([strike]);
    expect(
      extractDistributionRows<RoyaltyDisputeRow>(
        { disputes: [dispute], total: 1 },
        "disputes",
      ),
    ).toEqual([dispute]);
    expect(
      extractDistributionRows<DmcaStrikeRow>(
        { reinstatements: [strike], total: 1 },
        "reinstatements",
      ),
    ).toEqual([strike]);
  });

  it("does not turn malformed responses into an empty successful list", () => {
    expect(() => extractDistributionRows({ claims: { total: 1 } }, "claims")).toThrow(
      "claims is not an array",
    );
    expect(() => extractDistributionRows(null, "claims")).toThrow(
      "Invalid distribution response for claims",
    );
    expect(() =>
      extractDistributionRows({ claims: [null] }, "claims"),
    ).toThrow("claims contains an invalid row");
  });

  it("renders only fields that are present on real rows", () => {
    expect(displayValue("audio")).toBe("audio");
    expect(displayValue(undefined)).toBe("Not recorded");
    expect(displayValue(null, "None recorded")).toBe("None recorded");
    expect(displayDate("not-a-date")).toBe("Not recorded");
    expect(displayDate(null, "No expiry recorded")).toBe("No expiry recorded");
  });
});