import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { createReleaseDraftSchema } from "../../server/routes/distribution-release-schemas.js";

describe("distribution wizard draft persistence", () => {
  it("preserves a supplied UPC in draft metadata without accepting malformed identifiers", () => {
    expect(createReleaseDraftSchema.parse({ title: "Draft", upc: "012345678905" }).upc)
      .toBe("012345678905");
    expect(() => createReleaseDraftSchema.parse({ title: "Draft", upc: "not-an-identifier" })).toThrow();
    expect(createReleaseDraftSchema.parse({ title: "Draft" }).upc).toBeUndefined();
  });
  it("accepts a minimal draft with validated royalty splits", () => {
    const parsed = createReleaseDraftSchema.parse({
      title: "  Work in progress  ",
      royaltySplits: [
        {
          name: "Artist One",
          email: "artist@example.com",
          role: "performer",
          percentage: 70,
        },
        {
          name: "Producer Two",
          email: "producer@example.com",
          role: "producer",
          percentage: 30,
        },
      ],
    });

    expect(parsed.title).toBe("Work in progress");
    expect(parsed.royaltySplits).toHaveLength(2);
  });

  it("requires a title and rejects incomplete split totals", () => {
    expect(() => createReleaseDraftSchema.parse({})).toThrow();
    expect(() =>
      createReleaseDraftSchema.parse({
        title: "Draft",
        royaltySplits: [
          {
            name: "Artist One",
            email: "artist@example.com",
            role: "performer",
            percentage: 70,
          },
        ],
      }),
    ).toThrow(/must total 100%/);
  });

  it("retains the acknowledged release when media fails so retry PATCHes instead of duplicating it", async () => {
    // Execute the real helper, without mounting React or contacting services.
    const source = ts.createSourceFile("wizard.tsx", readFileSync(
      "client/src/components/distribution/ReleaseWizard.tsx", "utf8",
    ), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let initializer: ts.Expression | undefined;
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === "persistDraft") {
        initializer = node.initializer;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(initializer).toBeDefined();
    const code = ts.transpileModule(`return (${initializer!.getText(source)});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const payload = { title: "Draft", royaltySplits: [{ name: "Artist", percentage: 100 }] };
    const apiRequest = vi.fn().mockResolvedValue({ json: async () => ({ id: "owned-release" }) });
    const persistMedia = vi.fn().mockRejectedValueOnce(new Error("Upload failed")).mockResolvedValue(undefined);
    const ref = { current: undefined as string | undefined };
    const save = new Function("apiRequest", "releasePayload", "releaseIdRef", "setDraftReleaseId", "persistMedia", code)(
      apiRequest, () => payload, ref, vi.fn(), persistMedia,
    );
    await expect(save()).rejects.toThrow("Upload failed");
    expect(ref.current).toBe("owned-release");
    await expect(save()).resolves.toEqual({ id: "owned-release" });
    expect(apiRequest.mock.calls).toEqual([
      ["POST", "/api/distribution/releases", payload],
      ["PATCH", "/api/distribution/releases/owned-release", payload],
    ]);
  });
});