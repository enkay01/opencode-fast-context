import { execFileSync, spawn } from "node:child_process";

const WINDOWS = process.platform === "win32";
const NEEDS_QUOTE = /[\s"&|<>^()]/;

function quoteWin(arg) {
  if (arg.length === 0) return '""';
  return NEEDS_QUOTE.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

/**
 * Build a spawn plan for a CLI that may be a .cmd shim on Windows.
 * Windows cannot launch a .cmd file directly, so it runs through cmd.exe with
 * the whole command line quoted for `/s /c`.
 */
export function launch(command, args) {
  if (!WINDOWS) return { file: command, args, options: {} };
  const line = [command, ...args].map(quoteWin).join(" ");
  return {
    file: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    options: { windowsVerbatimArguments: true },
  };
}

export function runCli(command, args, options = {}) {
  const plan = launch(command, args);
  return execFileSync(plan.file, plan.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 128 * 1024 * 1024,
    ...plan.options,
    ...options,
  });
}

export function spawnCli(command, args, options = {}) {
  const plan = launch(command, args);
  return spawn(plan.file, plan.args, { ...plan.options, ...options });
}
