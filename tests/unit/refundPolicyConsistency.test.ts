import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("refund policy consistency", () => {
  it("keeps customer-facing purchase surfaces on the 90-day guarantee", () => {
    const pricing = read("client/src/pages/Pricing.tsx");
    const terms = read("client/src/pages/Terms.tsx");
    const help = read("client/src/pages/Help.tsx");
    const registrationCheckout = read("client/src/pages/RegisterPayment.tsx");
    const supportAI = read("server/services/supportAIService.ts");

    expect(pricing).toMatch(/90-Day Money-Back Guarantee/i);
    expect(terms).toMatch(/90-Day Window/i);
    expect(terms).toMatch(/within the 90-day window/i);
    expect(help).toMatch(/90-day money-back guarantee/i);
    expect(registrationCheckout).toMatch(/90-Day Money-Back Guarantee/i);
    expect(supportAI).toMatch(/90-Day Money-Back Guarantee/i);
    expect(supportAI).toMatch(/Full refund within 90 days of purchase/i);
  });

  it("does not reintroduce the retired 7-day subscription refund copy", () => {
    const customerPolicyFiles = [
      read("client/src/pages/Pricing.tsx"),
      read("client/src/pages/Terms.tsx"),
      read("client/src/pages/Help.tsx"),
      read("client/src/pages/RegisterPayment.tsx"),
      read("server/services/supportAIService.ts"),
    ].join("\n");

    expect(customerPolicyFiles).not.toMatch(/7-Day Refund Window/i);
    expect(customerPolicyFiles).not.toMatch(/within 7 days of purchase/i);
    expect(customerPolicyFiles).not.toMatch(/within the 7-day window/i);
    expect(customerPolicyFiles).not.toMatch(/Lifetime subscriptions are non-refundable/i);
  });
});
