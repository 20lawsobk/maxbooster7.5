import { describe, expect, it } from "vitest";
import { getNotificationAction } from "../../client/src/lib/notificationAction";

describe("notification action boundary", () => {
  it.each(["javascript:alert(1)", "data:text/html,test", "//evil.test", "/\\evil.test", " https://example.com", "https://user:password@example.com", "httpx://example.com", "/\n/evil.test", null])("rejects unsafe action %s", (value) => {
    expect(getNotificationAction(value)).toBeNull();
  });
  it("preserves local routes and encoded query strings", () => {
    expect(getNotificationAction("/projects?name=a%20b")).toEqual({url: "/projects?name=a%20b", external: false});
  });
  it("accepts explicit web links", () => {
    expect(getNotificationAction("https://example.com/path")).toEqual({url: "https://example.com/path", external: true});
  });
});
