import { describe, expect, it } from "vitest";
import {
  formatSocialPlatformCallbackNames,
  normalizeSocialPlatformStatuses,
  socialPlatformConnectId,
} from "../../client/src/lib/socialPlatformStatus";

describe("Social Media platform status normalization", () => {
  it("expands Meta only for accounts with per-platform evidence", () => {
    const statuses = normalizeSocialPlatformStatuses([
      {
        id: "meta",
        isConnected: true,
        status: "active",
        metadata: {
          facebook: { username: "artist", followers: 0 },
          instagram: { followers: 0, username: null, profileUrl: null },
        },
      },
    ]);

    expect(statuses.map((status) => status.id)).toEqual(["facebook"]);
    expect(statuses[0].isConnected).toBe(true);
  });

  it("does not turn an aggregate Meta status into two connected cards without evidence", () => {
    const statuses = normalizeSocialPlatformStatuses([
      {
        id: "meta",
        isConnected: true,
        status: "active",
        followers: 0,
        metadata: {
          facebook: { followers: 0, username: null, profileUrl: null },
          instagram: { followers: 0, username: null, profileUrl: null },
        },
      },
    ]);

    expect(statuses).toEqual([]);
  });

  it("maps provider aliases to the eight card ids and excludes Spotify", () => {
    const statuses = normalizeSocialPlatformStatuses([
      { id: "twitter", isConnected: true, status: "active" },
      { id: "googlebusiness", isConnected: true, status: "active" },
      { id: "spotify", isConnected: true, status: "active" },
    ]);

    expect(statuses.map((status) => status.id)).toEqual([
      "x",
      "google_business",
    ]);
  });

  it("retains disconnected and error statuses without marking cards connected", () => {
    const statuses = normalizeSocialPlatformStatuses([
      { id: "twitter", isConnected: false, status: "inactive" },
      { id: "google_business", isConnected: false, status: "error" },
    ]);

    expect(statuses).toMatchObject([
      { id: "x", isConnected: false, status: "inactive" },
      { id: "google_business", isConnected: false, status: "error" },
    ]);
  });
});

describe("Social Media OAuth platform aliases", () => {
  it.each([
    ["facebook", "meta"],
    ["instagram", "meta"],
    ["x", "twitter"],
    ["twitter", "twitter"],
    ["google_business", "googlebusiness"],
    ["googlebusiness", "googlebusiness"],
  ])("uses %s as the UI id and %s for the OAuth route", (uiId, routeId) => {
    expect(socialPlatformConnectId(uiId)).toBe(routeId);
  });

  it("normalizes callback labels without changing the eight-card inventory", () => {
    expect(formatSocialPlatformCallbackNames("twitter,googlebusiness")).toBe(
      "X & Google Business",
    );
  });
});