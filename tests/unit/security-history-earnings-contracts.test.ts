import { describe, expect, it } from "vitest";
import {
  parseActiveSessions,
  parseLoginHistory,
} from "../../client/src/lib/securityHistoryContracts";
import {
  earningsPerStream,
  formatEarningsRate,
} from "../../client/src/lib/earningsRate";

describe("security history response contracts", () => {
  it("unwraps the mounted sessions endpoint and preserves identity/current-device fields", () => {
    const sessions = [{
      id: "test-session",
      device: "Windows PC",
      browser: "Chrome",
      location: "Unknown",
      current: true,
      lastActivity: "2026-09-17T12:00:00.000Z",
    }];
    expect(parseActiveSessions({ sessions, totalCount: 1 })).toBe(sessions);
  });
  it("accepts genuinely empty history and session results", () => {
    expect(parseActiveSessions({ sessions: [] })).toEqual([]);
    expect(parseLoginHistory([])).toEqual([]);
  });
  it("rejects malformed envelopes and entries rather than pretending no sessions exist", () => {
    for (const data of [null, {}, [], { sessions: {} }, { sessions: [null] }]) {
      expect(() => parseActiveSessions(data)).toThrow("invalid");
    }
    expect(() => parseLoginHistory({ history: [] })).toThrow("invalid");
    expect(() => parseLoginHistory([null])).toThrow("invalid");
  });
  it("preserves real successful/suspicious login history flags", () => {
    const history = [{
      id: "event",
      timestamp: "2026-09-17T12:00:00.000Z",
      device: "Browser",
      ipAddress: "Unknown",
      success: false,
      suspicious: true,
    }];
    expect(parseLoginHistory(history)).toBe(history);
  });
});

describe("earnings rate without fabricated denominators", () => {
  it("shows unavailable when the denominator or source data is unavailable", () => {
    for (const streams of [0, -1, undefined, null, NaN, Infinity, "100"]) {
      expect(earningsPerStream(0, streams)).toBeNull();
      expect(formatEarningsRate(0, streams)).toBe("—");
    }
    expect(formatEarningsRate(undefined, 100)).toBe("—");
    expect(formatEarningsRate(NaN, 100)).toBe("—");
  });
  it("distinguishes real zero revenue from no streams, and formats the selected unit", () => {
    expect(formatEarningsRate(0, 100)).toBe("$0.0000");
    expect(formatEarningsRate(10, 2000)).toBe("$0.0050");
    expect(formatEarningsRate(10, 2000, 1000, 3)).toBe("$5.000");
  });
});