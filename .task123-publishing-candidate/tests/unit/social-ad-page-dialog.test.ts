import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const dialog = readFileSync("client/src/components/social/SchedulePostDialog.tsx", "utf8");
const social = readFileSync("client/src/pages/SocialMedia.tsx", "utf8");

// Run the real component callbacks against local state/promise dependencies.
// This is not a DOM test and cannot establish Radix/browser interaction behavior.
function callback(source: string, name: string, dependencies: Record<string, unknown>) {
  const file = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error(`Missing callback ${name}`);
  const compiled = ts.transpileModule(`const callback = ${expression.getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  // eslint-disable-next-line no-new-func -- Execute only repository-owned, transpiled AST fixtures with injected test dependencies; no untrusted input.
  return new Function(...Object.keys(dependencies), `${compiled}; return callback;`)(...Object.values(dependencies));
}

function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const input = {
  title: "Release announcement", content: "Caption entered by the owner",
  platforms: ["instagram"], scheduledFor: "2030-05-02T16:30", postType: "image",
  mediaUrls: ["/api/storage/file/owned"], hashtags: ["#release"],
  mentions: ["@owner"], location: "Studio", status: "draft",
};

function harness(onSchedule = vi.fn()) {
  const savingRef = { current: false };
  const state = {
    formData: structuredClone(input), hashtagInput: "unfinished-tag",
    mentionInput: "unfinished-mention", isSubmitting: false, submitError: null as string | null,
  };
  const setFormData = vi.fn((value) => { state.formData = value; });
  const onOpenChange = vi.fn();
  const createScheduleFormData = vi.fn(() => ({ ...input, title: "", content: "", platforms: [] }));
  const dependencies = {
    formData: state.formData, savingRef, onSchedule, onOpenChange, createScheduleFormData, setFormData,
    setIsSubmitting: (value: boolean) => { state.isSubmitting = value; },
    setSubmitError: (value: string | null) => { state.submitError = value; },
    setHashtagInput: (value: string) => { state.hashtagInput = value; },
    setMentionInput: (value: string) => { state.mentionInput = value; },
  };
  return {
    state, savingRef, onSchedule, onOpenChange, setFormData, createScheduleFormData,
    submit: callback(dialog, "handleSubmit", dependencies),
    changeOpen: callback(dialog, "handleOpenChange", dependencies),
  };
}

describe("SchedulePostDialog persistence lifecycle", () => {
  it.each(["draft", "scheduled"])("waits for actual %s persistence before close/reset", async (status) => {
    const save = deferred();
    const h = harness(vi.fn(() => save.promise));
    const pending = h.submit(status);
    expect(h.onSchedule).toHaveBeenCalledWith({ ...input, status });
    expect(h.state.isSubmitting).toBe(true);
    expect(h.savingRef.current).toBe(true);
    expect(h.onOpenChange).not.toHaveBeenCalled();
    expect(h.setFormData).not.toHaveBeenCalled();
    expect(h.state.formData).toEqual(input);
    save.resolve({ id: "saved" });
    await pending;
    expect(h.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(h.createScheduleFormData).toHaveBeenCalledTimes(1);
    expect(h.state.formData.content).toBe("");
    expect(h.state.hashtagInput).toBe("");
    expect(h.state.mentionInput).toBe("");
    expect(h.state.isSubmitting).toBe(false);
    expect(h.savingRef.current).toBe(false);
  });

  it.each(["draft", "scheduled"])("keeps all %s input and surfaces rejection without closing", async (status) => {
    const save = deferred();
    const h = harness(vi.fn(() => save.promise));
    const pending = h.submit(status);
    save.reject(new Error("Storage unavailable"));
    await pending;
    expect(h.state.submitError).toBe("Storage unavailable");
    expect(h.state.formData).toEqual(input);
    expect(h.state.hashtagInput).toBe("unfinished-tag");
    expect(h.state.mentionInput).toBe("unfinished-mention");
    expect(h.setFormData).not.toHaveBeenCalled();
    expect(h.onOpenChange).not.toHaveBeenCalled();
    expect(h.state.isSubmitting).toBe(false);
    expect(h.savingRef.current).toBe(false);
  });

  it("guards same-tick duplicate actions and dismissal until persistence settles", async () => {
    const save = deferred();
    const h = harness(vi.fn(() => save.promise));
    const pending = h.submit("draft");
    await h.submit("scheduled");
    await h.submit("draft");
    h.changeOpen(false);
    expect(h.onSchedule).toHaveBeenCalledTimes(1);
    expect(h.state.isSubmitting).toBe(true);
    expect(h.onOpenChange).not.toHaveBeenCalled();
    save.reject(new Error("Retry later"));
    await pending;
    h.changeOpen(false);
    expect(h.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("allows a retry after rejection and clears the prior error", async () => {
    const retry = deferred();
    const onSchedule = vi.fn().mockRejectedValueOnce(new Error("Try again")).mockReturnValueOnce(retry.promise);
    const h = harness(onSchedule);
    await h.submit("draft");
    const pending = h.submit("draft");
    expect(h.state.submitError).toBeNull();
    expect(h.state.formData).toEqual(input);
    expect(onSchedule).toHaveBeenCalledTimes(2);
    retry.resolve({ id: "saved" });
    await pending;
    expect(h.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not interpret a legacy void callback as a persisted save", async () => {
    const h = harness(vi.fn(() => undefined));
    await h.submit("draft");
    expect(h.state.submitError).toContain("did not return a persistence promise");
    expect(h.state.formData).toEqual(input);
    expect(h.onOpenChange).not.toHaveBeenCalled();
  });

  it("exposes pending/error semantics and locks controls in the component markup", () => {
    expect(dialog).toContain("onSchedule: (data: SchedulePostData) => Promise<unknown>");
    expect(dialog).toContain("<fieldset disabled={isSubmitting}");
    expect(dialog).toContain('role="alert"');
    expect(dialog).toContain('role="status"');
    expect(dialog).toContain("aria-busy={isSubmitting}");
    expect(dialog).toContain("disabled={isSubmitting ||");
    expect(dialog).toContain("onEscapeKeyDown=");
    expect(dialog).toContain("onInteractOutside=");
    const compiled = ts.transpileModule(dialog, {
      fileName: "dialog.tsx", reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    expect(compiled.diagnostics?.filter((entry) => entry.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });
});

describe("SocialMedia's only SchedulePostDialog caller", () => {
  it.each([null, { id: "existing-draft" }])("awaits the actual mutation and propagates rejection: %j", async (editingCalendarPost) => {
    const save = deferred();
    const mutateAsync = vi.fn(() => save.promise);
    const run = callback(social, "handleSchedulePost", {
      editingCalendarPost,
      updateCalendarPostMutation: { mutateAsync },
      createCalendarPostMutation: { mutateAsync },
    });
    const pending = run(input);
    expect(mutateAsync).toHaveBeenCalledWith(
      editingCalendarPost ? { postId: "existing-draft", data: input } : input,
    );
    const rejection = expect(pending).rejects.toThrow("Persistence rejected");
    save.reject(new Error("Persistence rejected"));
    await rejection;
  });

  it.each([null, { id: "existing-draft" }])("does not resolve the parent promise before save succeeds: %j", async (editingCalendarPost) => {
    const save = deferred();
    const run = callback(social, "handleSchedulePost", {
      editingCalendarPost,
      updateCalendarPostMutation: { mutateAsync: () => save.promise },
      createCalendarPostMutation: { mutateAsync: () => save.promise },
    });
    let complete = false;
    const pending = run(input).then(() => { complete = true; });
    await Promise.resolve();
    expect(complete).toBe(false);
    save.resolve({ id: "saved" });
    await pending;
    expect(complete).toBe(true);
  });
});
