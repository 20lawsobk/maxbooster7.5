"use strict";
// Plain CommonJS worker (mirrors tfWorkerThread.cjs convention) so it loads
// under worker_threads regardless of the app's own ESM ("type": "module")
// setting. No app imports here on purpose — keeps the worker dependency-free
// and independently loadable in both dev (tsx) and any bundled dist build.
const { parentPort } = require("worker_threads");
const zlib = require("zlib");

if (!parentPort) throw new Error("Must run as worker thread");

function qualityFor(size) {
  if (size <= 1024 * 1024) return 11;
  if (size <= 8 * 1024 * 1024) return 10;
  return 9;
}

parentPort.on("message", (msg) => {
  const { id, type, data } = msg;
  try {
    if (type === "compress") {
      const buf = Buffer.from(data);
      const compressed = zlib.brotliCompressSync(buf, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: qualityFor(buf.length),
          [zlib.constants.BROTLI_PARAM_LGWIN]: zlib.constants.BROTLI_MAX_WINDOW_BITS,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
      });
      parentPort.postMessage({ id, result: compressed }, [compressed.buffer]);
      return;
    }
    if (type === "decompress") {
      const buf = Buffer.from(data);
      const decompressed = zlib.brotliDecompressSync(buf);
      parentPort.postMessage({ id, result: decompressed }, [decompressed.buffer]);
      return;
    }
    parentPort.postMessage({ id, error: `Unknown message type: ${type}` });
  } catch (err) {
    parentPort.postMessage({ id, error: (err && err.message) || String(err) });
  }
});

parentPort.postMessage({ ready: true });
