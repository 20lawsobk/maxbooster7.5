import { beforeAll, describe, expect, it } from "vitest";

let helpers: typeof import("../../client/src/components/studio/UICustomizer");

beforeAll(async () => {
  Object.assign(globalThis, {
    window: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  helpers = await import("../../client/src/components/studio/UICustomizer");
});

describe("studio preference hydration helpers", () => {
  it("accepts persisted server preferences in a browser without local state", () => {
    const preferences = helpers.normalizeUIPreferences({
      zoomLevel: 1.5,
      theme: { accentColor: "#123456" },
      meterSettings: { ballistics: "slow" },
    });

    expect(preferences.zoomLevel).toBe(1.5);
    expect(preferences.theme.accentColor).toBe("#123456");
    expect(preferences.theme.backgroundColor).toBe("#1a1a2e");
    expect(preferences.meterSettings.ballistics).toBe("slow");
    expect(preferences.panels.length).toBeGreaterThan(0);
  });

  it("merges defaults and rejects invalid nested preference values", () => {
    const preferences = helpers.normalizeUIPreferences({
      zoomLevel: 99,
      panels: [{ id: "browser", visible: "yes" }],
      theme: { textColor: 42 },
      meterSettings: { ballistics: "instant", peakHold: "forever" },
      layoutPresets: [{ id: "broken", name: "Broken" }],
    });

    expect(preferences.zoomLevel).toBe(1);
    expect(preferences.panels.find((panel) => panel.id === "browser")?.visible)
      .toBe(true);
    expect(preferences.theme.textColor).toBe("#e5e5e5");
    expect(preferences.meterSettings.ballistics).toBe("medium");
    expect(preferences.layoutPresets.some((preset) => preset.id === "broken"))
      .toBe(false);
    expect(preferences.layoutPresets.length).toBeGreaterThan(0);
  });

  it("does not overwrite unsaved edits or rehydrate on refetch", () => {
    expect(
      helpers.shouldApplyServerHydration({
        userId: "user-a",
        hydratedUserId: null,
        hasUnsavedEdits: true,
        hasServerData: true,
      }),
    ).toBe(false);
    expect(
      helpers.shouldApplyServerHydration({
        userId: "user-a",
        hydratedUserId: "user-a",
        hasUnsavedEdits: false,
        hasServerData: true,
      }),
    ).toBe(false);
  });

  it("scopes the optional cache to the authenticated user", () => {
    expect(helpers.getStudioPreferencesStorageKey("user-a")).not.toBe(
      helpers.getStudioPreferencesStorageKey("user-b"),
    );
    expect(helpers.getStudioPreferencesStorageKey(null)).toBeNull();
  });
});