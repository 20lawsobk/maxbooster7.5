import { describe, expect, it } from "vitest";
import {
  getStorefrontPathUrl,
  STOREFRONT_APP_ORIGIN,
  STOREFRONT_URL_FORMAT,
} from "../../server/config/storefrontUrls.js";

describe("storefront URL policy", () => {
  it("uses the deployed app slug route instead of a platform subdomain", () => {
    const url = getStorefrontPathUrl("artist-name");

    expect(STOREFRONT_URL_FORMAT).toBe("slug");
    expect(url).toBe(`${STOREFRONT_APP_ORIGIN}/storefront/artist-name`);
    expect(url).not.toContain(".max-booster.com");
    expect(url).not.toMatch(/https:\/\/artist-name\./);
  });

  it("escapes slugs while keeping them on the existing route", () => {
    expect(getStorefrontPathUrl("artist name")).toBe(
      `${STOREFRONT_APP_ORIGIN}/storefront/artist%20name`,
    );
  });
});