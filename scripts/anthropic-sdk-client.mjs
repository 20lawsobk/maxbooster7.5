import Anthropic from "@anthropic-ai/sdk";
import { pathToFileURL } from "node:url";

const REQUEST_LIMIT_BYTES = 24 * 1024 * 1024;

export async function callClaude(request, { client: providedClient } = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("Claude request must be a JSON object");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!providedClient && !apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client =
    providedClient ??
    new Anthropic({
      apiKey,
      maxRetries: 4,
      timeout: 300_000,
    });

  const response = await client.messages.create(request);
  const result = JSON.parse(JSON.stringify(response));
  if (!result || !Array.isArray(result.content)) {
    throw new Error("Anthropic SDK returned an invalid message response");
  }
  return result;
}

async function readRequest() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > REQUEST_LIMIT_BYTES) {
      throw new RangeError("Claude SDK request exceeds the 24 MiB limit");
    }
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(input);
}

async function main() {
  try {
    const response = await callClaude(await readRequest());
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    // Do not print provider response bodies, prompts, or credentials to stderr.
    const name = error instanceof Error ? error.constructor.name : "Error";
    process.stderr.write(`Anthropic Node SDK request failed (${name})\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
