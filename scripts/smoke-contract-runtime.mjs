#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { AUTO_INVOKE_GUIDANCE } from "../dist/guidance.js";
import { TOOL_DESCRIPTION } from "../dist/tool.js";

const repo = resolve(".");
const requests = [];
const server = createServer((request, response) => {
  if (!request.url?.includes("/chat/completions")) {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    try {
      requests.push(JSON.parse(body));
    } catch {
      requests.push({ raw: body });
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({
        id: "chatcmpl_smoke",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { role: "assistant", content: "contract captured" }, finish_reason: null }],
      })}\n\n`,
    );
    response.write(
      `data: ${JSON.stringify({
        id: "chatcmpl_smoke",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\n`,
    );
    response.end("data: [DONE]\n\n");
  });
});

await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
const port = server.address().port;

async function runOpenCode(autoInvoke) {
  const home = await mkdtemp(join(tmpdir(), "fast-context-contract-"));
  const configDir = join(home, ".config", "opencode");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, "opencode.json"),
    `${JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        model: "mock/mock-model",
        plugins: [autoInvoke === "suggest" ? `file://${repo}` : { package: `file://${repo}`, options: { autoInvoke } }],
        provider: {
          mock: {
            npm: "@ai-sdk/openai-compatible",
            name: "Mock",
            options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "dummy" },
            models: {
              "mock-model": {
                name: "Mock",
                tool_call: true,
                limit: { context: 100_000, output: 4096 },
              },
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );

  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_CACHE_HOME: join(home, ".cache"),
  };
  delete env.TYPESAFE_API_KEY;
  const result = await new Promise((resolvePromise) => {
    const child = spawn(
      "opencode",
      ["run", "--standalone", "--model", "mock/mock-model", "--auto", "contract smoke"],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, output });
    });
  });
  await rm(home, { recursive: true, force: true });
  return result;
}

try {
  const suggest = await runOpenCode("suggest");
  const suggestRequest = requests.at(-1);
  assert.ok(suggestRequest, `OpenCode made no model request. Output:\n${suggest.output.slice(-2000)}`);
  const serialized = JSON.stringify(suggestRequest);
  assert.ok(serialized.includes(TOOL_DESCRIPTION), "effective tool description missing from model request");
  assert.match(serialized, /fast_context_search/);
  assert.match(serialized, /"maxFiles"/);
  assert.match(serialized, /"minimum":1/);
  assert.match(serialized, /"maximum":20/);
  assert.equal(serialized.split(AUTO_INVOKE_GUIDANCE).length - 1, 1, "guidance should appear once");

  const off = await runOpenCode("off");
  const offRequest = requests.at(-1);
  assert.ok(offRequest, `OpenCode made no model request for autoInvoke off. Output:\n${off.output.slice(-2000)}`);
  const offSerialized = JSON.stringify(offRequest);
  assert.ok(offSerialized.includes(TOOL_DESCRIPTION), "tool description should remain with autoInvoke off");
  assert.ok(!offSerialized.includes(AUTO_INVOKE_GUIDANCE), "guidance should be absent with autoInvoke off");

  const version = await new Promise((resolvePromise) => {
    const child = spawn("opencode", ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.on("close", () => resolvePromise(output.trim()));
  });

  console.log(`contract smoke: ${version}; description, schema and suggest/off guidance captured`);
} finally {
  server.close();
}
