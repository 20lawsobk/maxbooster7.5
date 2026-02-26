'use strict';
const { workerData, parentPort } = require('worker_threads');

if (!parentPort) throw new Error('Must run as worker thread');

let tf = null;

async function loadTF() {
  if (!tf) {
    tf = require('@tensorflow/tfjs-node');
  }
  return tf;
}

const modelCache = new Map();

parentPort.on('message', async (msg) => {
  const { id, type, modelId, inputData, inputShape } = msg;

  if (type !== 'predict') {
    parentPort.postMessage({ id, error: `Unknown message type: ${type}` });
    return;
  }

  try {
    const tfLib = await loadTF();
    const inputTensor = tfLib.tensor(inputData, inputShape);

    const model = modelCache.get(modelId);
    if (!model) {
      parentPort.postMessage({ id, error: `Model not loaded in worker: ${modelId}` });
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
});

parentPort.postMessage({ ready: true });
