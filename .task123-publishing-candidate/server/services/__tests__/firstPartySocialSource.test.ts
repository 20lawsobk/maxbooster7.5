import { describe, expect, it } from "vitest";
import { CHECKOUT_CURRENCY, CHECKOUT_PRICING } from "../checkoutPricing.js";
import {
  buildCheckoutPricingContext,
  resolveFirstPartySocialSource,
} from "../firstPartySocialSource.js";
import { buildSocialUrlMaxCoreRequest } from "../socialUrlMaxCoreTransport.js";

const APP_ORIGIN = "https://maxbooster.replit.app";

describe("first-party social source resolution", () => {
  it("resolves only the exact configured pricing page to internal checkout facts", () => {
    const source = resolveFirstPartySocialSource(
      `${APP_ORIGIN}/pricing?utm_source=social#plans`,
      new Set([APP_ORIGIN]),
    );

    expect(source).toMatchObject({
      title: "Max Booster pricing",
      topic: "Max Booster pricing plans",
      contentType: "pricing",
      provenance: "server_checkout_catalog",
    });
    expect(source?.topic).not.toMatch(/^https?:\/\//i);
    expect(source?.extraContext).toBe(buildCheckoutPricingContext());
  });

  it.each([
    "https://maxbooster.replit.app.evil.example/pricing",
    "https://attacker.replit.app/pricing",
    "https://attacker.replit.dev/pricing",
    "https://maxbooster.replit.app/other",
    "https://maxbooster.replit.app/pricing/extra",
    "http://maxbooster.replit.app/pricing",
    "https://user@maxbooster.replit.app/pricing",
    "https://maxbooster.replit.app:8443/pricing",
    "https://127.0.0.1/pricing",
  ])("does not resolve untrusted or non-canonical URL %s", (url) => {
    expect(
      resolveFirstPartySocialSource(url, new Set([APP_ORIGIN, "https://127.0.0.1"])),
    ).toBeNull();
  });

  it("formats context from the checkout amounts and currency", () => {
    const context = buildCheckoutPricingContext();
    const format = (cents: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: CHECKOUT_CURRENCY.toUpperCase(),
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(cents / 100);

    expect(context).toContain(format(CHECKOUT_PRICING.monthly.amountCents));
    expect(context).toContain(format(CHECKOUT_PRICING.yearly.amountCents));
    expect(context).toContain(
      format(CHECKOUT_PRICING.yearly.amountCents / 12),
    );
    expect(context).toContain(format(CHECKOUT_PRICING.lifetime.amountCents));
    expect(context).toContain("Do not infer included features");
  });

  it("sends first-party facts with a non-URL topic but leaves external URLs unchanged", () => {
    const source = resolveFirstPartySocialSource(
      `${APP_ORIGIN}/pricing`,
      new Set([APP_ORIGIN]),
    );
    expect(source).not.toBeNull();

    const firstPartyRequest = buildSocialUrlMaxCoreRequest({
      url: `${APP_ORIGIN}/pricing`,
      topic: source!.topic,
      extraContext: source!.extraContext,
      platform: "instagram",
      userId: "user-1",
      tone: "professional",
      format: "text",
    });
    expect(firstPartyRequest.topic).toBe("Max Booster pricing plans");
    expect(firstPartyRequest.topic).not.toMatch(/^https?:\/\//i);
    expect(firstPartyRequest.extra_context).toBe(source!.extraContext);

    const externalUrl = "https://public.example/articles/new-release";
    const externalRequest = buildSocialUrlMaxCoreRequest({
      url: externalUrl,
      platform: "instagram",
      userId: "user-1",
      tone: "professional",
      format: "text",
    });
    expect(externalRequest.topic).toBe(externalUrl);
    expect(externalRequest).not.toHaveProperty("extra_context");
  });
});