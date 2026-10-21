import { readFileSync } from "node:fs";
import ts from "typescript";
import * as projectContracts from "../../client/src/lib/projectsPageContracts";
import { describe, expect, it, vi } from "vitest";
import { resolveProjectAudioSource } from "../../client/src/lib/projectsPageContracts";
import { parseOnboardingUpdateResponse } from "../../client/src/lib/onboardingMode";
import { resolveProjectAudioSource } from "../../client/src/lib/projectsPageContracts";

const paths = {
  dashboard: "client/src/pages/Dashboard.tsx",
  simplified: "client/src/pages/SimplifiedDashboard.tsx",
  projects: "client/src/pages/ProjectsPageImpl.tsx",
};
const sources = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]),
);

// Exercise the actual page callbacks without importing the app, browser storage,
// auth provider, network clients, or server startup.
function callback(
  page: string,
  name: string,
  dependencies: Record<string, unknown>,
  mutation = false,
  mutationMember = "mutationFn",
) {
  const file = ts.createSourceFile(paths[page as keyof typeof paths], sources[page], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (expression) return;
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) {
      if (mutation && ts.isCallExpression(node.initializer)) {
        const options = node.initializer.arguments[0] as ts.ObjectLiteralExpression;
        expression = (
          options.properties.find(property => property.name?.getText(file) === mutationMember) as
            | ts.PropertyAssignment
            | undefined
        )?.initializer;
      } else {
        expression = node.initializer;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error(`Callback ${name} not found`);
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
  const output = ts.transpileModule(`${helpers}\nconst callback = ${expression.getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  // eslint-disable-next-line no-new-func -- Execute only repository-owned, transpiled AST fixtures with injected test dependencies; no untrusted input.
  return new Function(...Object.keys(dependencies), `${output}\nreturn callback;`)(...Object.values(dependencies));
}

describe("dashboard and projects page regressions", () => {
  it.each(Object.entries(paths))("parses %s without TSX syntax errors", (_name, path) => {
    const result = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    expect(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it.each(["dashboard", "simplified"])("patches only changed full-mode preferences without resending stale onboarding metadata (%s)", async page => {
    const preferences = { persona: "producer", experienceLevel: "advanced", userLevel: "advanced", goals: ["release"], preferSimplifiedView: true };
    const apiRequest = vi.fn(async (_method: string, _url: string, _body: { onboardingData: Record<string, unknown> }) => ({
      json: async () => ({ success: true }),
    }));
    const save = callback(page, page === "dashboard" ? "fullDashboardMutation" : "upgradeToFullModeMutation", {
      apiRequest,
      user: { onboardingData: preferences },
      onboardingData: preferences,
      getStoredOnboardingData: (user: any) => user.onboardingData,
      parseOnboardingUpdateResponse,
    }, true);
    await save();
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/auth/update-onboarding", {
      hasCompletedOnboarding: true,
      onboardingData: {
        preferSimplifiedView: false,
      },
    });
    const submittedPreferences = apiRequest.mock.calls[0][2].onboardingData;
    expect(submittedPreferences).not.toHaveProperty("persona");
    expect(submittedPreferences).not.toHaveProperty("goals");
    expect(submittedPreferences).not.toHaveProperty("experienceLevel");
    expect(submittedPreferences).not.toHaveProperty("userLevel");
  });

  it.each(["dashboard", "simplified"])("does not claim a preference was saved for an unsuccessful response (%s)", async page => {
    const save = callback(page, page === "dashboard" ? "fullDashboardMutation" : "upgradeToFullModeMutation", {
      apiRequest: async () => ({ json: async () => ({ success: false }) }),
      user: {},
      onboardingData: {},
      getStoredOnboardingData: () => ({}),
      parseOnboardingUpdateResponse,
    }, true);
    await expect(save()).rejects.toThrow(
      page === "dashboard"
        ? "Your dashboard preference was not saved."
        : "The onboarding update did not complete successfully.",
    );
  });

  it("reads persisted preference data from the authenticated user, not the status-only endpoint", () => {
    expect(sources.simplified).not.toContain("onboardingStatus?.onboardingData");
    expect(sources.simplified).toContain("user?.onboardingData");
    expect(sources.simplified).toContain('queryKey: ["/api/auth/me"]');
    expect(sources.simplified).toContain("useRequireSubscription()");
    expect(sources.dashboard).not.toContain('localStorage.getItem("onboardingSkipped")');
    expect(sources.dashboard).toContain("hasDashboardPaidAccess(user)");
  });

  it("rebinds playback completion to the current project when projects share an audio URL", async () => {
    const audio = {
      src: "https://app.example/audio.mp3", currentTime: 9,
      pause: vi.fn(), play: vi.fn(async () => {}),
      onended: null as null | (() => void),
    };
    const setCurrentlyPlaying = vi.fn();
    const audioProjectRef = { current: "first" };
    const audioRef = { current: audio };
    const setAudioLoading = vi.fn();
    const stopPlayback = callback("projects", "stopPlayback", { audioRef, audioProjectRef, setCurrentlyPlaying, setAudioLoading });
    const play = callback("projects", "handlePlayProject", {
      currentlyPlaying: null, audioRef, audioProjectRef, resolveProjectAudioSource,
      setCurrentlyPlaying, setAudioLoading, toast: vi.fn(),
      errorMessage: (error: unknown, fallback: string) =>
        error instanceof Error && error.message ? error.message : fallback,
      window: { location: { href: "https://app.example/projects", origin: "https://app.example" } },
    });
    play({ id: "second", audioUrl: "https://app.example/audio.mp3" });
    await Promise.resolve();
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(audioProjectRef.current).toBe("second");
    audio.onended?.();
    expect(audioProjectRef.current).toBeNull();
    expect(setCurrentlyPlaying).toHaveBeenLastCalledWith(null);
  });

  it("does not stop current playback when a project has no audio", () => {
    const pause = vi.fn();
    const toast = vi.fn();
    const play = callback("projects", "handlePlayProject", {
      currentlyPlaying: "first", audioRef: { current: { pause } }, toast,
    });
    play({ id: "second", audioUrl: null });
    expect(pause).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No Audio File" }));
  });

  it("ignores late draft recovery after a different project is opened", async () => {
    const recoveries: Array<(value: unknown) => void> = [];
    const setEditForm = vi.fn();
    const editRequestRef = { current: 0 };
    const edit = callback("projects", "handleEdit", {
      editRequestRef, offlineIdentity: () => ({ owner: "owner" }), assertOfflineIdentity: vi.fn(),
      setEditingProject: vi.fn(), setDraftMessage: vi.fn(), setEditForm, setIsEditOpen: vi.fn(),
      draftStorage: { getDraft: () => new Promise(resolve => recoveries.push(resolve)) },
    });
    const first = edit({ id: "first", title: "First" });
    const second = edit({ id: "second", title: "Second" });
    recoveries[1]({ data: { title: "Recovered second" } });
    await second;
    recoveries[0]({ data: { title: "Stale first" } });
    await first;
    expect(setEditForm).toHaveBeenLastCalledWith({ title: "Recovered second" });
    expect(setEditForm).not.toHaveBeenCalledWith({ title: "Stale first" });
  });

  it("ignores a late recovery error from an older project but reports the current project's error", async () => {
    const failures: Array<(error: Error) => void> = [];
    const setDraftMessage = vi.fn();
    const edit = callback("projects", "handleEdit", {
      editRequestRef: { current: 0 },
      offlineIdentity: () => ({ owner: "owner", epoch: 1 }),
      assertOfflineIdentity: vi.fn(),
      setEditingProject: vi.fn(),
      setDraftMessage,
      setEditForm: vi.fn(),
      setIsEditOpen: vi.fn(),
      draftStorage: {
        getDraft: () => new Promise((_resolve, reject) => failures.push(reject)),
      },
    });
    const older = edit({ id: "older", title: "Older" });
    const current = edit({ id: "current", title: "Current" });

    failures[0](new Error("old project storage failure"));
    await older;
    expect(setDraftMessage).not.toHaveBeenCalledWith(
      "Local drafts are unavailable. Keep this form open until your update succeeds.",
    );

    failures[1](new Error("current project storage failure"));
    await current;
    expect(setDraftMessage).toHaveBeenLastCalledWith(
      "Local drafts are unavailable. Keep this form open until your update succeeds.",
    );
  });

  it("does not apply recovered data after the offline account identity changes", async () => {
    let owner = "account-a";
    let epoch = 1;
    let resolveDraft!: (value: unknown) => void;
    const setEditForm = vi.fn();
    const setDraftMessage = vi.fn();
    const edit = callback("projects", "handleEdit", {
      editRequestRef: { current: 0 },
      offlineIdentity: () => ({ owner, epoch }),
      assertOfflineIdentity: (expected: { owner: string; epoch: number }) => {
        if (expected.owner !== owner || expected.epoch !== epoch) {
          throw new Error("Account changed during offline operation");
        }
      },
      setEditingProject: vi.fn(),
      setDraftMessage,
      setEditForm,
      setIsEditOpen: vi.fn(),
      draftStorage: {
        getDraft: () => new Promise(resolve => { resolveDraft = resolve; }),
      },
    });

    const pending = edit({ id: "account-a-project", title: "Account A" });
    owner = "account-b";
    epoch += 1;
    resolveDraft({ data: { title: "Private account A draft" } });
    await pending;

    expect(setEditForm).not.toHaveBeenCalledWith({
      title: "Private account A draft",
    });
    expect(setDraftMessage).not.toHaveBeenCalledWith(
      "Recovered a draft saved on this device. Review it before updating.",
    );
  });

  it("invalidates an in-flight draft recovery when the edit dialog closes", async () => {
    let resolveDraft!: (value: unknown) => void;
    const editRequestRef = { current: 0 };
    const setEditForm = vi.fn();
    const setDraftMessage = vi.fn();
    const dependencies = {
      editRequestRef,
      offlineIdentity: () => ({ owner: "owner", epoch: 1 }),
      assertOfflineIdentity: vi.fn(),
      setEditingProject: vi.fn(),
      setDraftMessage,
      setEditForm,
      setIsEditOpen: vi.fn(),
      draftStorage: {
        getDraft: () => new Promise(resolve => { resolveDraft = resolve; }),
      },
    };
    const pending = callback("projects", "handleEdit", dependencies)({
      id: "p1",
      title: "Project",
    });
    callback("projects", "handleEditDialogOpenChange", dependencies)(false);
    resolveDraft({ data: { title: "Closed dialog draft" } });
    await pending;

    expect(setEditForm).not.toHaveBeenCalledWith({
      title: "Closed dialog draft",
    });
    expect(setDraftMessage).not.toHaveBeenCalledWith(
      "Recovered a draft saved on this device. Review it before updating.",
    );
    expect(dependencies.setIsEditOpen).toHaveBeenCalledWith(false);
  });

  it("retains version-checked offline cleanup and explicit retry states", () => {
    expect(sources.projects).toContain("saved?.version === action.metadata?.draftVersion");
    expect(sources.projects).not.toContain("deleteDraft(`project-edit:${editingProject.id}`)");
    expect(sources.projects).toContain("if (!user) return null");
    expect(sources.dashboard).toContain("Upcoming releases could not be loaded.");
    expect(sources.dashboard).toContain("Your projects could not be loaded.");
  });

  it("uses the countdown route's data envelope rather than silently hiding saved releases", () => {
    const route = readFileSync("server/routes/releaseCountdown.ts", "utf8");
    expect(route).toContain("data: countdownsWithProgress");
    expect(sources.dashboard).toContain("select: normalizeDashboardCountdowns");
    expect(sources.dashboard).toContain("const countdowns = data ?? []");
    expect(sources.dashboard).not.toContain("data?.countdowns");
  });

  it("persists dashboard mode changes and uses the shared feature-selection handler", () => {
    expect(sources.dashboard).toContain("onUpgrade={handleUpgradeToFullMode}");
    expect(sources.dashboard).toContain("onExploreFeature={handleExploreFeature}");
    expect(sources.dashboard).toContain("onSkip={handleOnboardingSkip}");
  });
});
