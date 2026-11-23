import assert from "node:assert/strict";
import test from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { callClaude } from "../../scripts/anthropic-sdk-client.mjs";

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
  assert.equal(sentHeaders.get("x-api-key"), "test-only-not-a-real-key");
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
