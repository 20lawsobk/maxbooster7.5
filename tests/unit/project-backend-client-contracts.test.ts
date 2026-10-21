import { readFileSync } from "node:fs";
import ts from "typescript";
import * as projectContracts from "../../client/src/lib/projectsPageContracts";
import { describe, expect, it, vi } from "vitest";
import { readProjectsJson, normalizeMutationSuccess, normalizeProjectResponse } from "../../client/src/lib/projectsPageContracts";

const paths = {
  projects: "client/src/pages/ProjectsPageImpl.tsx",
  hub: "client/src/components/studio/StudioStartHub.tsx",
  selector: "client/src/components/studio/FlowStateProjectSelector.tsx",
  settings: "client/src/components/studio/ProjectSettingsDialog.tsx",
  controller: "client/src/hooks/useStudioController.ts",
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]));
type Page = keyof typeof paths;

// Exercise actual callbacks without importing React, browser storage, auth, or
// app startup. These tests make no network requests or server/database imports.
function actual(page: Page, name: string, dependencies: Record<string, unknown>, member?: string) {
  const file = ts.createSourceFile(paths[page], sources[page], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (expression) return;
    if (name === "openingEffect" && ts.isCallExpression(node) && node.expression.getText(file) === "useEffect") {
      expression = node.arguments[0];
    } else if (name === "tempoHydrationEffect" && ts.isCallExpression(node) &&
        node.expression.getText(file) === "useEffect" && node.arguments[0].getText(file).includes("tempoPersistenceRef.current = snapshot")) {
      expression = node.arguments[0];
    } else if (!expression && ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) {
      expression = node.initializer;
      if (member && ts.isCallExpression(expression)) {
        const options = expression.arguments[0] as ts.ObjectLiteralExpression;
        expression = (options.properties.find(property => property.name?.getText(file) === member) as ts.PropertyAssignment)?.initializer;
      } else if (ts.isCallExpression(expression) && expression.expression.getText(file) === "useCallback") {
        expression = expression.arguments[0];
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error(`Missing ${page}.${name}.${member ?? ""}`);
  dependencies = { ...projectContracts, ...dependencies };
  const helperNodes: ts.Node[] = [];
  function collect(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "errorMessage") helperNodes.push(node);
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === "stopPlayback" && node.initializer) {
      helperNodes.push(ts.factory.createVariableStatement(undefined,
        ts.factory.createVariableDeclarationList([node], ts.NodeFlags.Const)));
    }
    ts.forEachChild(node, collect);
  }
  collect(file);
  const helpers = helperNodes.map(node => ts.isVariableStatement(node)
    ? "const stopPlayback = " + ((node.declarationList.declarations[0].initializer)!.getText(file)) + ";"
    : node.getText(file)).join("\n");
  const output = ts.transpileModule(`${helpers}\nreturn (${expression.getText(file)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.None },
  }).outputText;
  // eslint-disable-next-line no-new-func -- Execute only repository-owned, transpiled AST fixtures with injected test dependencies; no untrusted input.
  return new Function(...Object.keys(dependencies), output)(...Object.values(dependencies));
}

const version = "2026-01-02T03:04:05.000Z";
const staleVersion = "2025-01-02T03:04:05.000Z";
const project = { id: "p1", userId: "owner", createdAt: version, updatedAt: version, title: "Original" };
const form = { name: "Unsaved", description: "Keep me", tempo: 135, timeSignature: "3/4", sampleRate: 48000, bitDepth: 24 };
const identity = {
  offlineIdentity: () => "owner", assertOfflineIdentity: vi.fn(),
  navigator: { onLine: true }, toast: vi.fn(),
  readProjectsJson, normalizeMutationSuccess, normalizeProjectResponse,
};

describe("direct project caller version contracts", () => {
  it.each(Object.entries(paths))("transpiles %s without TSX syntax errors", (_key, path) => {
    const result = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    expect(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it("Projects PATCH fallback sends the edit-start version when local draft persistence fails", async () => {
    const apiRequest = vi.fn(async () => ({ json: async () => ({ id: "p1", userId: "owner", title: "Unsaved", createdAt: version, updatedAt: version }) }));
    const save = actual("projects", "editMutation", {
      ...identity, apiRequest, editingProject: project,
      draftStorage: { saveDraft: vi.fn(async () => { throw new Error("storage offline"); }) },
      setDraftMessage: vi.fn(),
    }, "mutationFn");
    await expect(save({ id: "p1", data: { title: "Unsaved", description: "", genre: "" } })).resolves.toEqual({ queued: false });
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/studio/projects/p1", { title: "Unsaved", description: "", genre: "", expectedUpdatedAt: version });
  });

  it("Projects keeps the same saved base version in the local draft and offline queue", async () => {
    const saveDraft = vi.fn(async () => ({ version: 7 }));
    const enqueue = vi.fn(async () => ({ id: "action1" }));
    const forceSyncAction = vi.fn(async () => ({ success: true }));
    const apiRequest = vi.fn();
    const save = actual("projects", "editMutation", {
      ...identity, apiRequest, editingProject: { ...project, updatedAt: staleVersion },
      draftStorage: { saveDraft }, offlineQueue: { enqueue }, syncManager: { forceSyncAction },
      setDraftMessage: vi.fn(),
    }, "mutationFn");
    await save({ id: "p1", data: { title: "Unsaved", description: "", genre: "" } });
    expect(saveDraft).toHaveBeenCalledWith("project-edit:p1", { title: "Unsaved", description: "", genre: "", expectedUpdatedAt: staleVersion });
    expect(enqueue).toHaveBeenCalledWith("project.update", {
      projectId: "p1", changes: { title: "Unsaved", description: "", genre: "" }, isStudio: false, expectedUpdatedAt: staleVersion,
    }, { conflictStrategy: "manual", metadata: { formId: "project-edit:p1", draftVersion: 7 } });
    expect(forceSyncAction).toHaveBeenCalledWith("action1");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("Projects restores a recovered draft's original version, not the newly listed row version", async () => {
    const setEditingProject = vi.fn();
    const setEditForm = vi.fn();
    const edit = actual("projects", "handleEdit", {
      ...identity, editRequestRef: { current: 0 },
      setEditingProject, setEditForm, setDraftMessage: vi.fn(), setIsEditOpen: vi.fn(),
      draftStorage: { getDraft: async () => ({ data: { title: "Recovered", expectedUpdatedAt: staleVersion } }) },
    });
    await edit(project);
    expect(setEditingProject).toHaveBeenLastCalledWith({ ...project, updatedAt: staleVersion });
    expect(setEditForm).toHaveBeenLastCalledWith({ title: "Recovered", expectedUpdatedAt: staleVersion });
    const save = actual("projects", "editMutation", {
      ...identity, editingProject: { ...project, updatedAt: undefined },
    }, "mutationFn");
    await expect(save({ id: "p1", data: { title: "Legacy unversioned draft" } })).rejects.toThrow("no saved project version");
  });

  it("Projects DELETE fallback sends the selected version without changing queue semantics", async () => {
    const apiRequest = vi.fn(async () => ({ json: async () => ({ success: true }) }));
    const enqueue = vi.fn(async () => { throw new Error("storage offline"); });
    const remove = actual("projects", "deleteMutation", {
      ...identity, projects: [project], offlineQueue: { enqueue }, apiRequest,
    }, "mutationFn");
    await remove("p1");
    expect(enqueue).toHaveBeenCalledWith("project.delete", { projectId: "p1", expectedUpdatedAt: version }, { conflictStrategy: "manual" });
    expect(apiRequest).toHaveBeenCalledWith("DELETE", "/api/studio/projects/p1", { expectedUpdatedAt: version });
  });

  it("saves, reopens, and submits a manual draft against its original version", async () => {
    let saved: any;
    let reopened: any;
    let reopenedForm: any;
    const data = { title: "Manual draft", description: "Retain my changes", genre: "jazz" };
    const persist = actual("projects", "handleSaveEditDraft", {
      ...identity, editingProject: { ...project, updatedAt: staleVersion }, editForm: data,
      setDraftMessage: vi.fn(),
      draftStorage: { saveDraft: async (_key: string, value: any) => { saved = { data: value }; } },
    });
    await persist();
    expect(saved.data.expectedUpdatedAt).toBe(staleVersion);
    const reopen = actual("projects", "handleEdit", {
      ...identity, editRequestRef: { current: 0 }, setDraftMessage: vi.fn(), setIsEditOpen: vi.fn(),
      setEditingProject: (value: any) => { reopened = value; }, setEditForm: (value: any) => { reopenedForm = value; },
      draftStorage: { getDraft: async () => saved },
    });
    await reopen(project);
    expect(reopened.updatedAt).toBe(staleVersion);
    const apiRequest = vi.fn(async () => ({ json: async () => ({ ...project, ...data }) }));
    const submit = actual("projects", "editMutation", {
      ...identity, editingProject: reopened, apiRequest, setDraftMessage: vi.fn(),
      draftStorage: { saveDraft: async () => { throw new Error("fixture device unavailable"); } },
    }, "mutationFn");
    await expect(submit({ id: project.id, data: reopenedForm })).resolves.toEqual({ queued: false });
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/studio/projects/p1", { ...data, expectedUpdatedAt: staleVersion });
  });

  it("offers an explicit server snapshot for older unversioned drafts without deleting them", () => {
    const setEditingProject = vi.fn(), setEditForm = vi.fn();
    const select = actual("projects", "handleUseServerVersion", {
      projects: [project], editingProject: { ...project, updatedAt: undefined }, editRequestRef: { current: 1 },
      setEditingProject, setEditForm, setDraftMessage: vi.fn(),
    });
    select();
    expect(setEditingProject).toHaveBeenCalledWith(project);
    expect(setEditForm).toHaveBeenCalledWith({ title: project.title, description: "", genre: "" });
  });

  it("a queued conflict never falls through to an unqueued project delete", async () => {
    const apiRequest = vi.fn();
    const remove = actual("projects", "deleteMutation", {
      ...identity, projects: [project], apiRequest,
      offlineQueue: { enqueue: async () => ({ id: "action1" }) },
      syncManager: { forceSyncAction: async () => ({ outcome: "conflict", error: "Review deletion" }) },
    }, "mutationFn");
    await expect(remove("p1")).rejects.toThrow("Review deletion");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it.each(["hub", "selector"] as const)("%s DELETE uses the selected snapshot, not a refetched list", async page => {
    const apiRequest = vi.fn(async () => ({ json: async () => ({ success: true }) }));
    const remove = actual(page, page === "hub" ? "deleteProjectMutation" : "deleteMutation", { apiRequest }, "mutationFn");
    await remove({ ...project, updatedAt: staleVersion });
    expect(apiRequest).toHaveBeenCalledWith("DELETE", "/api/studio/projects/p1", { expectedUpdatedAt: staleVersion });
    expect(sources[page]).toContain(page === "hub"
      ? "deleteProjectMutation.mutate(project)" : "deleteMutation.mutate(project)");
    await expect(remove({ ...project, updatedAt: undefined })).rejects.toThrow("version");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    await remove({ ...project, updatedAt: null });
    expect(apiRequest).toHaveBeenLastCalledWith("DELETE", "/api/studio/projects/p1", { expectedUpdatedAt: null });
  });

  it.each(["projects", "hub", "selector"] as const)("%s surfaces a deletion conflict instead of reporting success", page => {
    const toast = vi.fn();
    const error = Object.assign(new Error("Conflict"), { status: 409 });
    actual(page, page === "hub" ? "deleteProjectMutation" : "deleteMutation", { toast }, "onError")(error);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("Refresh and review"),
    }));
  });

  it("Projects reports PATCH 409 while leaving the form and draft untouched", async () => {
    const error = Object.assign(new Error("Conflict"), { status: 409 });
    const apiRequest = vi.fn(async () => { throw error; });
    const save = actual("projects", "editMutation", {
      ...identity, apiRequest, editingProject: project, setDraftMessage: vi.fn(),
      draftStorage: { saveDraft: async () => { throw new Error("unavailable"); } },
    }, "mutationFn");
    await expect(save({ id: "p1", data: { title: "Unsaved", description: "", genre: "" } })).rejects.toBe(error);
    const toast = vi.fn();
    actual("projects", "editMutation", { toast }, "onError")(error);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Your form is still here") }));
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("settings loads one canonical edit-start snapshot and sends its version with PATCH", async () => {
    const fetch = vi.fn(async () => ({
      ok: true, json: async () => ({ ...project, bpm: 120, description: "Server copy" }),
    }));
    const setForm = vi.fn();
    const setSnapshot = vi.fn();
    const effect = actual("settings", "openingEffect", { open: true, projectId: "p1", project: form, fetch, setForm, setSnapshot });
    effect();
    await vi.waitFor(() => expect(setSnapshot).toHaveBeenLastCalledWith({
      projectId: "p1", expectedUpdatedAt: version, loading: false, error: "",
    }));
    expect(setForm).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Original", description: "Server copy" }));
    const save = actual("settings", "saveMutation", {
      projectId: "p1", form, snapshot: setSnapshot.mock.lastCall![0], fetch,
      getCsrfTokenFromCookie: () => "csrf",
    }, "mutationFn");
    await save();
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/studio/projects/p1");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({
      expectedUpdatedAt: version, title: form.name, description: form.description,
      tempo: form.tempo, timeSignature: form.timeSignature, sampleRate: form.sampleRate, bitDepth: form.bitDepth,
    });
    expect(sources.settings).toContain("}, [open, projectId]);");
    expect(sources.settings).not.toContain("}, [open, project]);");
  });

  it("settings retains unsaved form/version after 409, without a version refresh or success callback", async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 409 }));
    const snapshot = { projectId: "p1", expectedUpdatedAt: staleVersion, loading: false };
    const save = actual("settings", "saveMutation", {
      projectId: "p1", form, snapshot, fetch, getCsrfTokenFromCookie: () => "",
    }, "mutationFn");
    await expect(save()).rejects.toThrow("Your settings remain in this form");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(snapshot.expectedUpdatedAt).toBe(staleVersion);
    expect(form.name).toBe("Unsaved");
    const toast = vi.fn();
    actual("settings", "saveMutation", { toast }, "onError")(new Error("Conflict; retain edits"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Conflict; retain edits" }));
  });

  it("settings refuses an absent or different project's snapshot rather than guessing null", async () => {
    for (const snapshot of [
      { projectId: "p1", expectedUpdatedAt: undefined, loading: false },
      { projectId: "other", expectedUpdatedAt: version, loading: false },
      { projectId: "p1", expectedUpdatedAt: version, loading: true },
    ]) {
      const fetch = vi.fn();
      const save = actual("settings", "saveMutation", { projectId: "p1", form, snapshot, fetch }, "mutationFn");
      await expect(save()).rejects.toThrow("have not loaded");
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it("settings ignores a late opening read after close or project change", async () => {
    let resolve!: (response: any) => void;
    const fetch = vi.fn(() => new Promise(done => { resolve = done; }));
    const setForm = vi.fn();
    const setSnapshot = vi.fn();
    const cleanup = actual("settings", "openingEffect", {
      open: true, projectId: "p1", project: form, fetch, setForm, setSnapshot,
    })();
    cleanup();
    resolve({ ok: true, json: async () => project });
    await new Promise(done => setTimeout(done, 0));
    expect(setForm).toHaveBeenCalledTimes(1);
    expect(setSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe("studio controller tempo persistence", () => {
  function dependencies(snapshot: any = { projectId: "p1", expectedUpdatedAt: version, inFlight: false, blocked: false }) {
    return {
      projectId: "p1", tempoPersistenceRef: { current: snapshot },
      setStoreTempo: vi.fn(), onError: vi.fn(), toast: vi.fn(),
      queryClient: { invalidateQueries: vi.fn() }, logger: { error: vi.fn() },
      apiRequest: vi.fn(async () => ({
        json: async () => ({ id: "p1", updatedAt: "2026-01-02T03:04:05.001Z", bpm: 135 }),
      })),
    };
  }

  it("hydrates canonical tempo/version at project selection and uses that snapshot without a submit-time read", async () => {
    const deps = dependencies();
    const cleanup = actual("controller", "tempoHydrationEffect", deps)();
    await vi.waitFor(() => expect(deps.setStoreTempo).toHaveBeenCalledWith(135));
    expect(deps.apiRequest).toHaveBeenCalledWith("GET", "/api/studio/projects/p1");
    expect(deps.tempoPersistenceRef.current.expectedUpdatedAt).toBe("2026-01-02T03:04:05.001Z");
    await actual("controller", "setTempo", deps)(140);
    expect(deps.apiRequest).toHaveBeenLastCalledWith("PATCH", "/api/studio/projects/p1", {
      tempo: 140, expectedUpdatedAt: "2026-01-02T03:04:05.001Z",
    });
    expect(deps.apiRequest).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it("advances its base only from this write's acknowledgement for a subsequent write", async () => {
    const deps = dependencies();
    const setTempo = actual("controller", "setTempo", deps);
    await setTempo(135);
    await setTempo(140);
    expect(deps.apiRequest).toHaveBeenNthCalledWith(1, "PATCH", "/api/studio/projects/p1", { tempo: 135, expectedUpdatedAt: version });
    expect(deps.apiRequest).toHaveBeenNthCalledWith(2, "PATCH", "/api/studio/projects/p1", {
      tempo: 140, expectedUpdatedAt: "2026-01-02T03:04:05.001Z",
    });
    expect(deps.onError).not.toHaveBeenCalled();
  });

  it("sends explicit null only when the genuinely loaded snapshot version is null", async () => {
    const deps = dependencies({ projectId: "p1", expectedUpdatedAt: null, inFlight: false, blocked: false });
    await actual("controller", "setTempo", deps)(135);
    expect(deps.apiRequest).toHaveBeenCalledWith("PATCH", "/api/studio/projects/p1", { tempo: 135, expectedUpdatedAt: null });
  });

  it("retains unsaved local tempo on 409 and blocks further writes without fetching a replacement version", async () => {
    const deps = dependencies();
    deps.apiRequest = vi.fn(async () => { throw Object.assign(new Error("Conflict"), { status: 409 }); });
    const setTempo = actual("controller", "setTempo", deps);
    await setTempo(145);
    expect(deps.setStoreTempo).toHaveBeenCalledExactlyOnceWith(145);
    expect(deps.onError.mock.lastCall![0].message).toContain("retained but not saved");
    expect(deps.tempoPersistenceRef.current).toMatchObject({ expectedUpdatedAt: version, blocked: true, inFlight: false });
    await setTempo(150);
    expect(deps.apiRequest).toHaveBeenCalledTimes(1);
    expect(deps.setStoreTempo).toHaveBeenCalledTimes(1);
    expect(deps.onError.mock.lastCall![0].message).toContain("needs review");
  });

  it.each([
    { projectId: "p1", expectedUpdatedAt: undefined, inFlight: false, blocked: false },
    { projectId: "other", expectedUpdatedAt: version, inFlight: false, blocked: false },
  ])("never guesses a missing/wrong-project version (%j)", async snapshot => {
    const deps = dependencies(snapshot);
    await actual("controller", "setTempo", deps)(150);
    expect(deps.apiRequest).not.toHaveBeenCalled();
    expect(deps.setStoreTempo).not.toHaveBeenCalled();
    expect(deps.onError).toHaveBeenCalled();
  });

  it("rejects rapid overlapping persistence without overwriting the in-flight local tempo", async () => {
    const deps = dependencies();
    let resolve!: (response: any) => void;
    deps.apiRequest = vi.fn(() => new Promise(done => { resolve = done; }));
    const setTempo = actual("controller", "setTempo", deps);
    const first = setTempo(135);
    await setTempo(140);
    expect(deps.apiRequest).toHaveBeenCalledTimes(1);
    expect(deps.setStoreTempo).toHaveBeenCalledExactlyOnceWith(135);
    expect(deps.onError.mock.lastCall![0].message).toContain("still saving");
    resolve({ json: async () => ({ id: "p1", updatedAt: "2026-01-02T03:04:05.001Z" }) });
    await first;
    expect(deps.tempoPersistenceRef.current.inFlight).toBe(false);
  });

  it("does not adopt a late save acknowledgement into a different selected project", async () => {
    const deps = dependencies();
    let resolve!: (response: any) => void;
    deps.apiRequest = vi.fn(() => new Promise(done => { resolve = done; }));
    const pending = actual("controller", "setTempo", deps)(135);
    const next = { projectId: "next", expectedUpdatedAt: staleVersion, inFlight: false, blocked: false };
    deps.tempoPersistenceRef.current = next;
    resolve({ json: async () => ({ id: "p1", updatedAt: version }) });
    await pending;
    expect(deps.tempoPersistenceRef.current).toBe(next);
    expect(next.expectedUpdatedAt).toBe(staleVersion);
    expect(deps.queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("ignores a late hydration read after cleanup instead of changing a newer project's tempo", async () => {
    const deps = dependencies();
    let resolve!: (response: any) => void;
    deps.apiRequest = vi.fn(() => new Promise(done => { resolve = done; }));
    const cleanup = actual("controller", "tempoHydrationEffect", deps)();
    cleanup();
    resolve({ json: async () => ({ id: "p1", updatedAt: version, bpm: 180 }) });
    await new Promise(done => setTimeout(done, 0));
    expect(deps.setStoreTempo).not.toHaveBeenCalled();
  });

  it("blocks ambiguous network failures and surfaces them even without an onError callback", async () => {
    const deps = { ...dependencies(), onError: undefined };
    deps.apiRequest = vi.fn(async () => { throw new Error("Connection lost; result unknown"); });
    await actual("controller", "setTempo", deps)(135);
    expect(deps.tempoPersistenceRef.current.blocked).toBe(true);
    expect(deps.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Tempo not saved" }));
  });
});
