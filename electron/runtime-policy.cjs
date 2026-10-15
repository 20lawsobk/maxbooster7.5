"use strict";
const http = require("node:http");

function externalHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function pingReadiness(origin, timeout = 1500) {
  return new Promise((resolve) => {
    const request = http.get(new URL("/api/ready", origin), { timeout }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

module.exports = { externalHttpUrl, pingReadiness };
