#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const OUTPUT = resolve("docs", "agent-contract.md");

export function renderContract(description, schema, guidance) {
  return `# Agent contract

Generated from the registered plugin definitions. Do not edit by hand.

## Tool

\`fast_context_search\`

${description}

## Input schema

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

## Session guidance (autoInvoke: suggest)

${guidance}
`;
}

async function load() {
  const tool = await import("../dist/tool.js");
  const guidance = await import("../dist/guidance.js");
  return renderContract(tool.TOOL_DESCRIPTION, tool.TOOL_INPUT_SCHEMA, guidance.AUTO_INVOKE_GUIDANCE);
}

const expected = await load();
if (process.argv.includes("--check")) {
  // Checkouts on Windows may hold CRLF; compare the text, not its line endings.
  const current = (await readFile(OUTPUT, "utf8").catch(() => "")).replace(/\r\n/g, "\n");
  if (current !== expected) {
    console.error("docs/agent-contract.md is out of date; run node scripts/generate-agent-contract.mjs");
    process.exit(1);
  }
  console.log("agent contract is current");
} else {
  await mkdir(resolve("docs"), { recursive: true });
  await writeFile(OUTPUT, expected);
  console.log(`wrote ${OUTPUT}`);
}
