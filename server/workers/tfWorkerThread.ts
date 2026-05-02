import { workerData, parentPort } from 'worker_threads';

if (!parentPort) throw new Error('Must run as worker thread');

let tf: typeof import('@tensorflow/tfjs') | null = null;

async function loadTF() {
  if (!tf) {
    tf = await import('@tensorflow/tfjs');
  }
  return tf;
}

const modelCache: Map<string, any> = new Map();

parentPort.on('message', async (msg: {
  id: string;
  type: 'predict';
  modelId: string;
  inputData: number[];
  inputShape: number[];
}) => {
  const { id, type, modelId, inputData, inputShape } = msg;

  if (type !== 'predict') {
    parentPort!.postMessage({ id, error: `Unknown message type: ${type}` });
    return;
  }

  try {
    const tfLib = await loadTF();

    const inputTensor = tfLib.tensor(inputData, inputShape);

    let model = modelCache.get(modelId);
    if (!model) {
      parentPort!.postMessage({ id, error: `Model not loaded in worker: ${modelId}` });
      inputTensor.dispose();
      return;
    }

    const start = Date.now();
    const output = model.predict(inputTensor) as Record<string, unknown>;
    const result = await output.data();
    const durationMs = Date.now() - start;

    inputTensor.dispose();
    output.dispose();

    parentPort!.postMessage({ id, result: Array.from(result), durationMs });
  } catch (err) {
    parentPort!.postMessage({ id, error: err.message || String(err) });
  }
});

parentPort!.postMessage({ ready: true });
