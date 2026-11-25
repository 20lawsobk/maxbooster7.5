import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { callClaude } from "../../scripts/anthropic-sdk-client.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const messageResponse = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-test",
  content: [{ type: "text", text: "sdk response" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 4, output_tokens: 3 },
};

test("Node SDK sends the message request and returns its normalized response", async () => {
  let sentBody;
  let sentHeaders;
  const client = new Anthropic({
    apiKey: "test-only-not-a-real-key",
    maxRetries: 0,
    fetch: async (_url, init) => {
      sentBody = JSON.parse(init.body);
      sentHeaders = new Headers(init.headers);
      return new Response(JSON.stringify(messageResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const response = await callClaude({
    model: "claude-test",
    max_tokens: 300,
    system: "test system",
    messages: [{ role: "user", content: "test input" }],
  }, { client });

  assert.deepEqual(response.content, messageResponse.content);
  assert.equal(sentBody.model, "claude-test");
  assert.equal(sentBody.messages[0].content, "test input");
  assert.equal(sentHeaders.get("authorization"), "Bearer test-only-not-a-real-key");
});

test("Node SDK preserves tool schemas and returned tool-use blocks", async () => {
  let sentBody;
  const client = new Anthropic({
    apiKey: "test-only-not-a-real-key",
    maxRetries: 0,
    fetch: async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ...messageResponse,
        content: [{
          type: "tool_use",
          id: "tool_1",
          name: "read_file",
          input: { path: "README.md" },
        }],
        stop_reason: "tool_use",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const response = await callClaude({
    model: "claude-test",
    max_tokens: 1000,
    system: "test",
    messages: [{ role: "user", content: "read README" }],
    tools: [{
      name: "read_file",
      description: "Read a file",
      input_schema: { type: "object", properties: { path: { type: "string" } } },
    }],
    thinking: { type: "enabled", budget_tokens: 1024 },
  }, { client });

  assert.equal(sentBody.tools[0].name, "read_file");
  assert.equal(sentBody.thinking.budget_tokens, 1024);
  assert.equal(response.content[0].type, "tool_use");
  assert.equal(response.content[0].input.path, "README.md");
});

test("Node SDK client rejects malformed requests before calling the provider", async () => {
  let called = false;
  const client = {
    messages: {
      create: async () => {
        called = true;
        return messageResponse;
      },
    },
  };
  await assert.rejects(() => callClaude(null, { client }), /must be a JSON object/);
  assert.equal(called, false);
});

test("Python audit bridge runs the selected Node SDK against a local test endpoint", async (t) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(messageResponse));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const python = spawn("python3", ["-c", [
    "import production_audit_ai as ai",
    "print(ai.call_model('test system', 'test user', 'claude-test', 32))",
  ].join("; ")], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: "test-only-not-a-real-key",
      ANTHROPIC_SDK_RUNTIME: "node",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  python.stdout.on("data", (chunk) => stdout.push(chunk));
  python.stderr.on("data", (chunk) => stderr.push(chunk));
  const [exitCode] = await once(python, "exit");
  assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
  assert.equal(Buffer.concat(stdout).toString("utf8").trim(), "sdk response");
  assert.equal(requests.length, 1, "one SDK call must produce one provider request");
  assert.equal(requests[0].messages[0].content, "test user");
});
