import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Pricing from "../../client/src/pages/Pricing";
import Terms from "../../client/src/pages/Terms";
import Privacy from "../../client/src/pages/Privacy";

// Match the app's JSX runtime without loading the app or any backend modules.
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function render(Page: React.ComponentType, path: string) {
  return renderToStaticMarkup(
    React.createElement(Router, { ssrPath: path }, React.createElement(Page)),
  );
}

describe("pricing and policy page rendering", () => {
  it.each([
    ["Pricing", Pricing, "/pricing"],
    ["Terms", Terms, "/terms"],
    ["Privacy", Privacy, "/privacy"],
  ] as const)("%s renders one main landmark and h1 without nested interactive links", (_name, Page, path) => {
    const html = render(Page, path);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/);
    expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<a\b/);
    expect(html).toMatch(/<a\b[^>]*href="\/"/);
  });

  it("shows canonical plan totals, annual equivalent, savings, and one-time billing", () => {
    const html = render(Pricing, "/pricing");
    expect(html).toContain("$49");
    expect(html).toContain("/month");
    expect(html).toContain("$468");
    expect(html).toContain("/year");
    expect(html).toContain("Billed annually • Equivalent to $39/month");
    expect(html).toContain("Save $120/year");
    expect(html).toContain("$699");
    expect(html).toContain("One-time payment, lifetime access");
    expect(html).not.toContain("$5616");
  });

  it("preserves all three checkout tier links and labels them distinctly", () => {
    const html = render(Pricing, "/pricing");
    for (const tier of ["monthly", "yearly", "lifetime"]) {
      expect(html).toContain(`href="/register/payment/${tier}"`);
      expect(html).toContain(`data-testid="button-select-${tier}"`);
      expect(html).toContain(`aria-label="Choose ${tier[0].toUpperCase()}${tier.slice(1)} plan"`);
    }
    expect(html).toContain('href="#plans"');
    expect(html).toContain('id="plans"');
    expect(html).toContain('aria-label="Open navigation menu"');
  });

  it("uses the same 90-day guarantee on Pricing and Terms without stale seven-day text", () => {
    for (const [Page, path] of [[Pricing, "/pricing"], [Terms, "/terms"]] as const) {
      const html = render(Page, path);
      expect(html.toLowerCase()).toContain("90-day money-back guarantee");
      expect(html).not.toMatch(/\b7[- ](?:day|Day|days|Days)\b/);
      expect(html).toContain("support@maxbooster.ai");
    }
  });

  it("gives comparison checkmarks accessible text and header associations", () => {
    const html = render(Pricing, "/pricing");
    expect(html).toContain("<caption");
    expect(html.match(/scope="col"/g)).toHaveLength(4);
    expect(html.match(/scope="row"/g)).toHaveLength(14);
    expect(html.match(/class="sr-only">Included</g)).toHaveLength(24);
  });

  it("does not promise 30 days of project access after subscription access ends", () => {
    const html = render(Pricing, "/pricing");
    expect(html).not.toContain("accessible for 30 days");
    expect(html).toContain("your access continues until that period ends");
  });

  it("does not invent a changing Terms revision date and keeps the existing Privacy date", () => {
    const termsSource = readFileSync("client/src/pages/Terms.tsx", "utf8");
    expect(termsSource).not.toContain("new Date()");
    expect(render(Privacy, "/privacy")).toContain(
      '<time dateTime="2025-11-11">November 11, 2025</time>',
    );
  });

  it("links Terms contacts and related policies to existing destinations", () => {
    const html = render(Terms, "/terms");
    for (const href of [
      "/privacy", "/dmca", "mailto:support@maxbooster.ai",
      "mailto:legal@maxbooster.ai", "mailto:privacy@maxbooster.ai",
      "mailto:dmca@maxbooster.com",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it.each(["Pricing", "Terms", "Privacy"])("compiles the actual %s TSX entry point", async (name) => {
    const file = `client/src/pages/${name}.tsx`;
    await expect(transform(readFileSync(file, "utf8"), {
      loader: "tsx", format: "esm", sourcefile: file,
    })).resolves.toHaveProperty("code");
  });
});
