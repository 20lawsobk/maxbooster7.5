import { describe, expect, it } from "vitest";
import { classifyRequestLogLevel } from "../../server/lib/requestLogLevel.js";

const defaults = {
  isAuthStatus: false,
  isAsset404: false,
  isBootWindow404: false,
};

describe("HTTP request log severity", () => {
  it("keeps readiness 503s visible as warnings rather than application errors", () => {
    expect(classifyRequestLogLevel({
      ...defaults,
      statusCode: 503,
      path: "/api/ready",
    })).toBe("warn");
  });

  it("still logs unrelated server failures as errors", () => {
    expect(classifyRequestLogLevel({
      ...defaults,
      statusCode: 503,
      path: "/api/projects",
    })).toBe("error");
  });

  it("logs authorization denials at info level", () => {
    expect(classifyRequestLogLevel({
      ...defaults,
      isAuthStatus: true,
      statusCode: 403,
      path: "/api/admin",
    })).toBe("info");
  });

  it("keeps real client failures as warnings", () => {
    expect(classifyRequestLogLevel({
      ...defaults,
      statusCode: 404,
      path: "/api/not-found",
    })).toBe("warn");
  });

  it("does not warn for known static-asset or boot-window 404s", () => {
    expect(classifyRequestLogLevel({
      ...defaults,
      isAsset404: true,
      statusCode: 404,
      path: "/assets/app.js",
    })).toBe("info");
    expect(classifyRequestLogLevel({
      ...defaults,
      isBootWindow404: true,
      statusCode: 404,
      path: "/api/health",
    })).toBe("info");
  });
});
