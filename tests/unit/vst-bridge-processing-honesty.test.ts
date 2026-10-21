import { describe, expect, it } from "vitest";
import { vstPluginBridge } from "../../server/services/vstPluginBridge";
import { NativeVstHostUnavailable } from "../../server/services/repositoryVstInventory";

const plugin = {
  id: "test-native-plugin",
  name: "Native Compressor",
  vendor: "Test",
  version: "1.0.0",
  format: "vst3",
  category: "effect",
  path: "/plugins/native.vst3",
  uniqueId: "native-1",
  numInputs: 2,
  numOutputs: 2,
  hasEditor: false,
  isSynth: false,
  parameters: [],
  programs: [],
};

describe("native VST processing honesty", () => {
  it("refuses to create a server-side instance without a native host", async () => {
    (vstPluginBridge as any).scannedPlugins.set(plugin.id, plugin);
    await expect(vstPluginBridge.createInstance(plugin.id, "project-1")).rejects.toBeInstanceOf(
      NativeVstHostUnavailable,
    );
  });

  it("refuses to report processed audio when no native host can process it", async () => {
    const now = new Date();
    const instance = {
      id: "test-native-instance",
      pluginId: plugin.id,
      pluginInfo: plugin,
      projectId: "project-1",
      chainPosition: 0,
      parameters: {},
      bypassed: false,
      sampleRate: 44100,
      blockSize: 512,
      state: "ready",
      editorOpen: false,
      createdAt: now,
      updatedAt: now,
    };
    (vstPluginBridge as any).instances.set(instance.id, instance);
    const input = [new Float32Array([0.1, 0.2]), new Float32Array([0.3, 0.4])];
    const request = { instanceId: instance.id, inputBuffers: input, outputBuffers: [], numSamples: 2 };

    try {
      await expect(vstPluginBridge.processAudio(request)).rejects.toBeInstanceOf(NativeVstHostUnavailable);

      await vstPluginBridge.setBypass(instance.id, true);
      await expect(vstPluginBridge.processAudio(request)).resolves.toBe(input);
    } finally {
      (vstPluginBridge as any).instances.delete(instance.id);
    }
  });
});
