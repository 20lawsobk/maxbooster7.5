"use strict";
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

// @electron/get v5 supports a custom Downloader. electron-builder still passes
// Node proxy agents and Got's timeout shape: implement that documented seam with
// native streaming HTTP, rather than silently passing ignored options to Fetch.
class ElectronDownloadTransport {
  async download(url, target, options = {}) {
    const requestTimeout = typeof options.timeout === "number" ? options.timeout : options.timeout?.request;
    if (requestTimeout !== undefined && (!Number.isFinite(requestTimeout) || requestTimeout <= 0)) {
      throw new TypeError("Download request timeout must be a positive finite number");
    }
    const deadline = requestTimeout === undefined ? undefined : AbortSignal.timeout(requestTimeout);
    const signals = [deadline, options.signal].filter(Boolean);
    const signal = signals.length ? AbortSignal.any(signals) : undefined;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    let created = false;
    try {
      const response = await this.request(new URL(url), options, signal);
      const totalHeader = response.headers["content-length"];
      const total = totalHeader === undefined ? null : Number(totalHeader);
      let transferred = 0;
      const progress = new Transform({
        transform(chunk, encoding, callback) {
          transferred += chunk.length;
          Promise.resolve().then(() => options.getProgressCallback?.({
            transferred, total, percent: total ? transferred / total : 0,
          })).then(() => callback(null, chunk), callback);
        },
      });
      const output = fs.createWriteStream(target, { flags: "wx" });
      output.once("open", () => { created = true; });
      await pipeline(response, progress, output, { signal });
      await options.getProgressCallback?.({ transferred, total, percent: 1 });
    } catch (error) {
      // Only remove a file we created for this download, never an earlier caller
      // file on request failure. @electron/get supplies a unique scratch target.
      if (created) await fs.promises.rm(target, { force: true });
      if (deadline?.aborted && !options.signal?.aborted) {
        const timeoutError = new Error(`Artifact request timed out after ${requestTimeout}ms`, { cause: error });
        timeoutError.name = "TimeoutError";
        timeoutError.code = "ETIMEDOUT";
        throw timeoutError;
      }
      throw error;
    }
  }

  request(url, options, signal, redirects = 0) {
    if (!["http:", "https:"].includes(url.protocol)) {
      return Promise.reject(new TypeError("Artifact URL must use HTTP or HTTPS"));
    }
    return new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const agent = options.agent && typeof options.agent === "object" && ("http" in options.agent || "https" in options.agent)
        ? options.agent[url.protocol.slice(0, -1)] : options.agent;
      const request = transport.get(url, {
        agent, headers: options.headers, signal,
        ...(url.protocol === "https:" ? options.https : {}),
      }, response => {
        const statusCode = response.statusCode;
        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
          response.destroy();
          const max = options.maxRedirects ?? 10;
          if (redirects >= max) return reject(new Error("Too many artifact redirects"));
          let next;
          try { next = new URL(response.headers.location, url); }
          catch (error) { reject(error); return; }
          if (url.protocol === "https:" && next.protocol === "http:") {
            return reject(new Error("Refusing HTTPS artifact redirect to HTTP"));
          }
          const headers = { ...options.headers };
          if (next.origin !== url.origin) {
            for (const name of Object.keys(headers)) {
              if (["authorization", "cookie", "proxy-authorization", "host"].includes(name.toLowerCase())) {
                delete headers[name];
              }
            }
            next.username = "";
            next.password = "";
          }
          this.request(next, { ...options, headers }, signal, redirects + 1).then(resolve, reject);
        } else if (statusCode < 200 || statusCode >= 300) {
          response.destroy();
          const error = new Error(`Response code ${statusCode} (${response.statusMessage}) for ${url}`);
          error.name = "HTTPError";
          // Both the native upstream and existing packager retry contracts.
          error.response = { status: statusCode, statusCode };
          reject(error);
        } else {
          resolve(response);
        }
      });
      request.once("error", reject);
    });
  }
}
module.exports = { ElectronDownloadTransport };