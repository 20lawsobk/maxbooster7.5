import { describe, expect, it } from "vitest";
import { isPublicPageRoute, shouldRedirectNativeLanding } from "../../client/src/lib/pageAccess";

describe("client page access policy", () => {
  it("allows anonymous published EPKs and storefront shortlinks", () => {
    for (const path of ["/epk/artist-kit", "/s/producer", "/store/producer", "/storefront/producer", "/marketplace/beat/beat-1", "/marketplace/producer/producer-1"]) {
      expect(isPublicPageRoute(path)).toBe(true);
      expect(isPublicPageRoute(`${path}?source=ad#preview`)).toBe(true);
    }
  });
  it("does not make owner tools, administration or route lookalikes public", () => {
    for (const path of ["/dashboard", "/projects", "/storefront", "/marketplace", "/admin", "/blog-admin", "/handle-link-admin", "/epk", "/s", "/s/producer/private", "/storefront/producer/private", "/marketplace/beat"]) {
      expect(isPublicPageRoute(path)).toBe(false);
    }
  });
  it("keeps auth and recovery pages accessible before native authentication resolves", () => {
    for (const path of ["/login", "/register", "/forgot-password", "/reset-password"]) {
      expect(isPublicPageRoute(path)).toBe(true);
      expect(shouldRedirectNativeLanding(path, false, false)).toBe(false);
      expect(shouldRedirectNativeLanding(path, true, true)).toBe(false);
      expect(shouldRedirectNativeLanding(path, true, false)).toBe(true);
    }
    expect(shouldRedirectNativeLanding("/epk/artist", true, false)).toBe(false);
  });
});
