import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const social = readFileSync("client/src/pages/SocialMedia.tsx", "utf8");
const ads = readFileSync("client/src/pages/Advertisement.tsx", "utf8");
const socialRoutes = readFileSync("server/routes/socialMedia.ts", "utf8");
const adRoutes = readFileSync("server/routes/advertising.ts", "utf8");

// Execute only the real page callback under test, with local dependencies.
// No page imports, auth bypass, network requests, database, or provider effects.
function callback(source: string, name: string, dependencies: Record<string, unknown>, property?: string) {
  const file = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) {
      expression = node.initializer;
      if (property && ts.isCallExpression(expression)) {
        const options = expression.arguments[0];
        if (ts.isObjectLiteralExpression(options)) {
          expression = options.properties.find(
            (entry) => ts.isPropertyAssignment(entry) && entry.name.getText(file) === property,
          );
          if (expression && ts.isPropertyAssignment(expression)) expression = expression.initializer;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error(`Callback not found: ${name}.${property || ""}`);
  const compiled = ts.transpileModule(`const callback = ${expression.getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  // eslint-disable-next-line no-new-func -- Execute only repository-owned, transpiled AST fixtures with injected test dependencies; no untrusted input.
  return new Function(...Object.keys(dependencies), `${compiled}; return callback;`)(...Object.values(dependencies));
}

function schedule(dependencies: Record<string, unknown> = {}) {
  const mutate = vi.fn();
  const toast = vi.fn();
  const run = callback(social, "handleSchedulePostFromTab", {
    schedulePostMutation: { isPending: false, mutate },
    uploadMediaMutation: { isPending: false },
    uploadedMedia: null, uploadedMediaUrl: null,
    postContent: "Real caption", selectedPlatforms: ["instagram"],
    regularContentFormat: "text", generatedVideoUrl: null, generatedImageUrl: null,
    window: { location: { origin: "https://app.example" } },
    scheduledTime: "2030-05-02T16:30", toast,
    ...dependencies,
  });
  return { run, mutate, toast };
}

describe("SocialMedia page callbacks and actual backend contracts", () => {
  it("sends saved uploaded media and an unambiguous ISO schedule", () => {
    const { run, mutate } = schedule({
      uploadedMedia: { type: "video/mp4" }, uploadedMediaUrl: "https://media.example/owned.mp4",
    });
    run();
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      content: "Real caption", mediaType: "video",
      mediaUrls: ["https://media.example/owned.mp4"],
      scheduledAt: new Date("2030-05-02T16:30").toISOString(),
    }));
    expect(socialRoutes).toContain("...(mediaUrls?.length ? { mediaUrl: mediaUrls[0], mediaUrls } : {})");
  });

  it.each(["image", "video"])("attaches generated %s instead of stale uploaded media", (format) => {
    const { run, mutate } = schedule({
      regularContentFormat: format, generatedVideoUrl: "https://media.example/video.mp4",
      generatedImageUrl: "https://media.example/image.png",
      uploadedMedia: { type: "video/mp4" }, uploadedMediaUrl: "https://media.example/old.mp4",
    });
    run();
    expect(mutate.mock.calls[0][0]).toMatchObject({
      mediaType: format,
      mediaUrls: [format === "video" ? "https://media.example/video.mp4" : "https://media.example/image.png"],
    });
  });

  it("resolves returned relative storage URLs for the backend URL schema", () => {
    const { run, mutate } = schedule({
      uploadedMedia: { type: "image/png" }, uploadedMediaUrl: "/api/storage/file/owned",
    });
    run();
    expect(mutate.mock.calls[0][0].mediaUrls).toEqual(["https://app.example/api/storage/file/owned"]);
  });

  it.each([
    { uploadMediaMutation: { isPending: true } },
    { uploadedMedia: { type: "image/png" }, uploadedMediaUrl: null },
    { scheduledTime: "invalid" },
    { regularContentFormat: "video", generatedVideoUrl: "blob:local-preview" },
  ])("does not silently drop failed/pending media or submit invalid time: %j", (dependencies) => {
    const { run, mutate, toast } = schedule(dependencies);
    run();
    expect(mutate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("blocks repeated submissions while pending", () => {
    const mutation = { isPending: true, mutate: vi.fn() };
    schedule({ schedulePostMutation: mutation }).run();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("does not turn Edit on an already-queued post into a duplicate Create", () => {
    const setEditingCalendarPost = vi.fn();
    const toast = vi.fn();
    const setActiveTab = vi.fn();
    const run = callback(social, "handleEditPost", {
      posts: [{ id: "queued", status: "scheduled" }, { id: "draft", status: "draft" }],
      setEditingCalendarPost, setScheduleDialogOpen: vi.fn(), setActiveTab, toast,
    });
    run("queued");
    expect(setEditingCalendarPost).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    run("draft");
    expect(setEditingCalendarPost).toHaveBeenCalledWith({ id: "draft", status: "draft" });
    expect(setActiveTab).toHaveBeenCalledWith("calendar");
    expect(socialRoutes).toContain("Queued or delivered posts cannot be edited in place.");
  });

  it("does not claim an AI recommendation performed an unwired action", () => {
    const toast = vi.fn();
    callback(social, "handleAIAction", { toast })("optimize");
    expect(toast.mock.calls[0][0].description).toContain("No automated action has been performed");
    expect(social).not.toContain("decodeURIComponent(errorMessage)");
  });
});

describe("Advertisement page contracts", () => {
  it("saves an audience draft without fabricating an estimated audience size", async () => {
    const apiRequest = vi.fn().mockResolvedValue({ json: async () => ({ id: "audience" }) });
    const run = callback(ads, "createLookalikeMutation", { apiRequest }, "mutationFn");
    await run({ sourceAudienceType: "top-engaged", expansionLevel: 2 });
    expect(apiRequest.mock.calls[0][2]).toMatchObject({ sourceAudience: "top-engaged", status: "draft" });
    expect(apiRequest.mock.calls[0][2]).not.toHaveProperty("estimatedSize");
    expect(adRoutes).toContain('status: status || "building"');
    expect(ads).toContain("No audience has been built or targeted.");
    expect(ads).toContain("normalizeSocialPlatformStatuses(");
  });

  it("rejects upload responses without persisted image URLs before reporting success", async () => {
    const run = callback(ads, "uploadImageMutation", {
      FormData, uploadWithProgress: vi.fn().mockResolvedValue({ success: true }),
    }, "mutationFn");
    await expect(run(new Blob(["image"]))).rejects.toThrow("saved image URL");
  });

  it("rejects social storage responses without a saved file URL", async () => {
    const run = callback(social, "uploadMediaMutation", {
      FormData, uploadWithProgress: vi.fn().mockResolvedValue({ success: true }),
    }, "mutationFn");
    await expect(run(new Blob(["media"]))).rejects.toThrow("saved media URL");
  });

  it("does not generate from an unloaded or failed promotable-content query", () => {
    expect(ads).toContain("!itemsLoading && !itemsError");
    expect(ads).toContain("!!selectedItem?.promotable");
    expect(ads).toContain("Campaigns could not be loaded");
    expect(ads).toContain("Create Campaign Draft");
  });

  it.each([["social", social], ["advertisement", ads]])("can save a first %s press kit when GET returned null", (_, source) => {
    const mutate = vi.fn();
    const run = callback(source, "handleSave", {
      pressKit: null, updatePressKitMutation: { mutate },
      FormData: class {
        entries() { return [["artistName", "Owner"], ["genres", "Jazz, Soul"]]; }
      },
    });
    run({ preventDefault: vi.fn(), currentTarget: {} });
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      artistName: "Owner", genres: ["Jazz", "Soul"], isPublic: false,
    }));
  });

  it.each([["social", social], ["advertisement", ads]])("reports clipboard denial instead of fake success in %s EPK", async (_, source) => {
    const toast = vi.fn();
    const run = callback(source, "copyPublicLink", {
      pressKit: { slug: "owner" }, window: { location: { origin: "https://app.example" } },
      navigator: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } },
      toast,
    });
    await run();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copy Failed", variant: "destructive" }));
  });

  it.each([["social", social], ["advertisement", ads]])("parses the edited %s TSX without syntax diagnostics", (_, source) => {
    const result = ts.transpileModule(source, {
      fileName: "page.tsx", reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    expect(result.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });
});
