"use strict";
const { workerData, parentPort } = require("worker_threads");

if (!parentPort) throw new Error("Must run as worker thread");

let tf = null;

async function loadTF() {
  if (!tf) {
    tf = require("@tensorflow/tfjs-node");
  }
  return tf;
}

const modelCache = new Map();

parentPort.on("message", async (msg) => {
  const { id, type, modelId, inputData, inputShape, modelPath } = msg;

  if (type === "load") {
    try {
      const tfLib = await loadTF();
      if (!modelPath) {
        parentPort.postMessage({
          id,
          type: "load",
          modelId,
          error: "modelPath is required for load",
        });
        return;
      }
      const fullPath = modelPath.startsWith("file://")
        ? modelPath
        : `file://${modelPath}`;
      const model = await tfLib.loadLayersModel(fullPath);
      modelCache.set(modelId, model);
      parentPort.postMessage({ id, type: "load", modelId, loaded: true });
    } catch (err) {
      parentPort.postMessage({
        id,
        type: "load",
        modelId,
        error: err.message || String(err),
      });
    }
    return;
  }

  if (type === "predict") {
    try {
      const tfLib = await loadTF();
      const inputTensor = tfLib.tensor(inputData, inputShape);

      const model = modelCache.get(modelId);
      if (!model) {
        parentPort.postMessage({
          id,
          error: `Model not loaded in worker: ${modelId}`,
        });
        inputTensor.dispose();
        return;
      }

      const start = Date.now();
      const output = model.predict(inputTensor);
      const result = await output.data();
      const durationMs = Date.now() - start;

      inputTensor.dispose();
      output.dispose();

      parentPort.postMessage({ id, result: Array.from(result), durationMs });
    } catch (err) {
      parentPort.postMessage({ id, error: err.message || String(err) });
    }
    return;
  }

  parentPort.postMessage({ id, error: `Unknown message type: ${type}` });
});

parentPort.postMessage({ ready: true });
