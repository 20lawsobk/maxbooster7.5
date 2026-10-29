import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const marketplace = readFileSync("client/src/pages/Marketplace.tsx", "utf8");
const storefront = readFileSync("client/src/components/marketplace/StorefrontBuilder.tsx", "utf8");

function extractFunction(source: string, name: string, globals: Record<string, unknown> = {}) {
  const file = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = file.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node) throw new Error(`Missing function ${name}`);
  const javascript = ts.transpileModule(node.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(`${javascript}; ${name}`, { ...globals, encodeURIComponent });
}

describe("Marketplace and storefront page contracts", () => {
  it.each([["Marketplace", marketplace], ["StorefrontBuilder", storefront]])("parses %s without syntax errors", (_name, source) => {
    const file = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect((file as any).parseDiagnostics).toEqual([]);
  });

  it.each([
    [marketplace, "loadMarketplaceData", "/api/marketplace/purchases"],
    [storefront, "loadStorefrontList", "/api/storefront/my"],
  ])("rejects malformed lists rather than rendering an empty success", async (source, name, path) => {
    const calls: unknown[][] = [];
    const load = extractFunction(source, name, {
      apiRequest: async (...args: unknown[]) => {
        calls.push(args);
        return { json: async () => ({ error: "not a list" }) };
      },
    });
    await expect(load(path)).rejects.toThrow(/invalid list/);
    expect(calls).toEqual([["GET", path]]);
  });

  it("preserves authentic empty lists and request failures", async () => {
    const empty = extractFunction(storefront, "loadStorefrontList", {
      apiRequest: async () => ({ json: async () => [] }),
    });
    expect(await empty("/api/storefront/my")).toEqual([]);
    const fail = extractFunction(marketplace, "loadMarketplaceData", {
      apiRequest: async () => { throw new Error("Service unavailable"); },
    });
    await expect(fail("/api/marketplace/purchases")).rejects.toThrow("Service unavailable");
  });

  it("builds canonical encoded links independently of domain aliases", () => {
    const canonical = extractFunction(storefront, "getCanonicalUrl", { STOREFRONT_BASE: "https://maxbooster.replit.app" });
    expect(canonical({ slug: "artist /beats", publicUrl: "https://other.example" }))
      .toBe("https://maxbooster.replit.app/storefront/artist%20%2Fbeats");
    expect(marketplace).toContain("https://maxbooster.replit.app/marketplace/beat/${encodeURIComponent(beat.id)}");
  });

  it("scopes owner reads and editor drafts to the authenticated identity", () => {
    for (const path of ["purchases", "sales-analytics", "my-beats", "escrow", "affiliates", "ai-recommendations", "license-templates", "contracts", "collaborations"]) {
      expect(marketplace).toContain(`queryKey: ["/api/marketplace/${path}", user?.id]`);
      expect(marketplace).toContain(`loadMarketplaceData("/api/marketplace/${path}"`);
    }
    expect(marketplace).toContain('<MarketplaceContent key={user?.id || "guest"}');
    expect(storefront).toContain('<StorefrontEditor key={user?.id || "guest"}');
    expect(storefront).toContain('queryKey: ["/api/storefront/my", ownerId]');
    expect(storefront).toContain('queryKey: ["/api/dns-manager/zones", ownerId]');
  });

  it("keeps failures distinct from empty states and removes fake saved licenses", () => {
    expect(marketplace).toContain("activeQueryError ?");
    expect(marketplace).toContain("activeQueryPending ?");
    expect(marketplace).toContain("const activeLicenseTemplates = licenseTemplatesData;");
    expect(storefront).toContain("storefrontsLoading ?");
    expect(storefront).toContain("storefrontsError ?");
    expect(storefront).toContain("tiersError ?");
    expect(storefront).toContain("templatesError ?");
  });

  it("matches the verified promotion route and Veo asset contract", () => {
    expect(storefront).toContain("promoteCampaignMutation.mutate(selectedStorefront.slug)");
    expect(storefront).toContain("{ slug },");
    expect(storefront).toContain("Array.isArray(data?.campaign?.assets)");
    expect(storefront).not.toMatch(/campaign\.(videos|platforms)/);
    expect(marketplace).not.toMatch(/\bsetLocation\(/);
  });

  it("does not claim publication, DNS readiness, or clipboard success prematurely", () => {
    expect(storefront).not.toContain("Your Domain is Live!");
    expect(storefront).toContain("Publish it when you are ready");
    expect(storefront).toContain("await navigator.clipboard.writeText(value)");
    expect(storefront).toContain('title: "Copy failed"');
    expect(marketplace).not.toContain("Escrow Protected");
    expect(storefront).toContain("selectedStorefrontIdRef.current !== uploadStorefrontId");
    expect(storefront).toContain('title: "Upload in progress"');
  });
});
