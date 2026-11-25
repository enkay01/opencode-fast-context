"""Drive a real OpenCode TUI in a disposable profile and capture terminal frames."""
import argparse
import codecs
from contextlib import contextmanager
import errno
import fcntl
import html
import http.server
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import threading
import time
import tty

ROOT = Path(__file__).resolve().parents[2]
ROWS, COLS = 38, 152
QUERY = "Locate validationRetryDelay with fast_context_search."
FIXTURE = "export const validationRetryDelay = 250;\n"
OPEN_CODE_ENV = (
    "OPENCODE_TEST_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME",
)
TOKEN = re.compile(
    r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b[\]P_G](?:[^\x07\x1b]|\x1b(?!\\))*?(?:\x07|\x1b\\)"
    r"|\x1b[^\[\]P_G]|[^\x1b]+",
)
BASE = ["#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
        "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"]
FG, BG = "#eeeeee", "#141414"


def color(n):
    if n < 16:
        return BASE[n]
    if n < 232:
        values = [0, 95, 135, 175, 215, 255]
        n -= 16
        return "#%02x%02x%02x" % (values[n // 36], values[n // 6 % 6], values[n % 6])
    return "#%02x%02x%02x" % ((8 + (n - 232) * 10,) * 3)


class Screen:
    def __init__(self):
        self.clear()
        self.pending = ""
        self.fg, self.bg = FG, BG

    def clear(self):
        self.cells = [[(" ", FG, BG) for _ in range(COLS)] for _ in range(ROWS)]
        self.row = self.col = 0

    def feed(self, data):
        self.pending += data
        cursor = 0
        while match := TOKEN.match(self.pending, cursor):
            cursor = match.end()
            item = match[0]
            if item.startswith("\x1b["):
                params, op = item[2:-1], item[-1]
                if params and params[0] in "?><!":
                    continue
                if not re.fullmatch(r"[\d;]*", params):
                    continue
                values = [int(part or 0) for part in params.split(";")]
                n = values[0] or 1
                if op in "Hf":
                    self.row = n - 1
                    self.col = (values[1] or 1) - 1 if len(values) > 1 else 0
                elif op == "J" and values[0] in (2, 3):
                    self.clear()
                elif op == "G":
                    self.col = n - 1
                elif op == "d":
                    self.row = n - 1
                elif op in "ABCD":
                    self.row += n * ((op == "B") - (op == "A"))
                    self.col += n * ((op == "C") - (op == "D"))
                elif op == "m":
                    self.style(values)
            elif not item.startswith("\x1b"):
                for char in item:
                    if char == "\r":
                        self.col = 0
                    elif char == "\n":
                        self.row += 1
                    elif ord(char) >= 32 and 0 <= self.row < ROWS and 0 <= self.col < COLS:
                        self.cells[self.row][self.col] = (char, self.fg, self.bg)
                        self.col += 1
        self.pending = self.pending[cursor:]

    def style(self, values):
        i = 0
        while i < len(values):
            code = values[i]
            i += 1
            if code == 0:
                self.fg, self.bg = FG, BG
            elif code == 39:
                self.fg = FG
            elif code == 49:
                self.bg = BG
            elif code in (38, 48) and i + 1 < len(values) and values[i] == 5:
                value = color(values[i + 1])
                i += 2
                if code == 38:
                    self.fg = value
                else:
                    self.bg = value
            elif code in (38, 48) and i + 3 < len(values) and values[i] == 2:
                value = "#%02x%02x%02x" % tuple(values[i + 1:i + 4])
                i += 4
                if code == 38:
                    self.fg = value
                else:
                    self.bg = value

    def text(self):
        return "\n".join("".join(cell[0] for cell in row).rstrip() for row in self.cells)

    def capture(self, path):
        parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{COLS * 9}" height="{ROWS * 18}" xml:space="preserve">',
                 f'<rect width="100%" height="100%" fill="{BG}"/>',
                 '<g font-family="Menlo, DejaVu Sans Mono, monospace" font-size="14">']
        for y, row in enumerate(self.cells):
            x = 0
            while x < COLS:
                _, fg, bg = row[x]
                end = x + 1
                while end < COLS and row[end][1:] == (fg, bg):
                    end += 1
                snippet = html.escape("".join(cell[0] for cell in row[x:end]))
                parts.append(f'<rect x="{x*9}" y="{y*18}" width="{(end-x)*9}" height="18" fill="{bg}"/>')
                if snippet.strip():
                    parts.append(f'<text x="{x*9}" y="{y*18+14}" textLength="{(end-x)*9}" lengthAdjust="spacingAndGlyphs" fill="{fg}">{snippet}</text>')
                x = end
        parts.append("</g></svg>")
        path.write_text("\n".join(parts))


class Tui:
    def __init__(self, project, env, mirror=False):
        self.screen = Screen()
        self.mirror = mirror
        self.decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
            os.chdir(project)
            os.execvpe("opencode", ["opencode", "--standalone", "--auto", str(project)], env)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        try:
            self.send("\x03")
            for _ in range(20):
                if os.waitpid(self.pid, os.WNOHANG)[0]:
                    break
                time.sleep(0.05)
            else:
                os.kill(self.pid, signal.SIGKILL)
                os.waitpid(self.pid, 0)
        except (ProcessLookupError, ChildProcessError, OSError):
            pass
        finally:
            os.close(self.fd)

    def send(self, value):
        os.write(self.fd, value.encode())

    def read(self, timeout=0.1):
        if select.select([self.fd], [], [], timeout)[0]:
            try:
                data = os.read(self.fd, 65_536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b""
            if not data:
                raise RuntimeError("OpenCode exited before validation completed")
            if self.mirror:
                sys.stdout.buffer.write(data)
                sys.stdout.buffer.flush()
            self.screen.feed(self.decoder.decode(data))

    def wait(self, expected, seconds=20):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.read()
            frame = self.screen.text()
            if isinstance(expected, str):
                if expected.lower() in frame.lower():
                    return
            elif match := expected.search(frame):
                return match
        raise RuntimeError(f"OpenCode did not display {expected!r}")

    def connected(self, provider):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            self.read()
            frame = self.screen.text()
            if f"{provider} · connected" in frame:
                return
            if f"{provider} rejected the key" in frame:
                raise RuntimeError(f"{provider} rejected the validation key")
            if f"Could not verify {provider} access" in frame:
                raise RuntimeError(f"Could not verify {provider} access. Check the provider API and try again.")
        raise RuntimeError(f"Sidebar did not confirm {provider} connection")

    def enter(self, value):
        self.send(value)
        # Slash completions settle before Enter.
        for _ in range(4):
            self.read()
        self.send("\r")

    def cancel_prompt(self, title):
        self.send("\x03")
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            self.read()
            if title.lower() not in self.screen.text().lower():
                return
        raise RuntimeError("The OpenCode credential prompt did not close on cancel")

    def enter_manual_key(self):
        self.enter("/fast-context auth gemini")
        title = "Store a Fast Context credential"
        self.wait(title)
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            self.read(0.05)
            frame = self.screen.text()
            if "gemini · connected" in frame or "gemini connected and selected." in frame.lower():
                return
            if title not in frame and "key saved." in frame.lower():
                raise RuntimeError("The key was saved. Check /fast-context auth status and select Gemini again.")
            if select.select([sys.stdin], [], [], 0)[0]:
                data = os.read(sys.stdin.fileno(), 65_536)
                if not data or b"\x03" in data:
                    raise RuntimeError("Gemini setup cancelled")
                os.write(self.fd, data)
        raise RuntimeError("Gemini did not connect. Check the masked prompt for validation errors and retry.")

    def provider_status(self, provider, connection):
        self.enter("/fast-context auth status")
        self.wait(f"Selected: {provider}")
        self.wait(f"Connection: {connection}")
        match = self.wait(re.compile(r"Server instance: ([a-f0-9-]{36})"))
        self.send("\r")
        for _ in range(4):
            self.read()
        return match[1]


@contextmanager
def terminal_input():
    fd = sys.stdin.fileno()
    settings = termios.tcgetattr(fd)
    tty.setraw(fd)
    try:
        yield
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, settings)
        sys.stdout.write("\x1b[?1049l\x1b[?25h\x1b[?2004l")
        sys.stdout.flush()


class Model(http.server.BaseHTTPRequestHandler):
    calls = 0
    results = []

    def log_message(self, *_):
        pass

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        messages = request["messages"]
        user = next((m for m in reversed(messages) if m["role"] == "user"), {})
        step = re.search(r"Validation step (\w+)", json.dumps(user.get("content", "")))
        label = step[1] if step else "unknown"
        tool_result = next((m for m in reversed(messages) if m["role"] == "tool"), None)
        # A new user prompt may follow earlier tool results in the same session.
        if tool_result is not None and messages.index(tool_result) > max(
                (i for i, m in enumerate(messages) if m["role"] == "user"), default=-1):
            payload = tool_result["content"]
            content = payload if isinstance(payload, str) else json.dumps(payload)
            provider = re.search(r"provider: (gemini|jev):([^\s\\\"]+)", content)
            status = re.search(r"status: (\w+)", content)
            observed = (provider[1] if provider else "none", status[1] if status else "unknown", "retry.ts" in content)
            self.results.append(observed)
            chunks = [{"content": f"Step {label} result: {observed[0]} / {observed[1]} / fixture {'found' if observed[2] else 'absent'}"}]
            finish = "stop"
        else:
            if not any(t.get("function", {}).get("name") == "fast_context_search" for t in request.get("tools", [])):
                self.send_error(422, "Fast Context tool is not registered")
                return
            Model.calls += 1
            chunks = [{"tool_calls": [{"index": 0, "id": f"fixture_{Model.calls}", "type": "function",
                                       "function": {"name": "fast_context_search",
                                                    "arguments": json.dumps({"query": f"validationRetryDelay {label}", "maxFiles": 1})}}]}]
            finish = "tool_calls"
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        for delta, reason in [(chunk, None) for chunk in chunks] + [({}, finish)]:
            frame = {"id": "chatcmpl_validation", "object": "chat.completion.chunk", "model": "validation",
                     "choices": [{"index": 0, "delta": delta, "finish_reason": reason}]}
            self.wfile.write(f"data: {json.dumps(frame)}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")


def build_plugin(profile):
    bundle = profile / "plugin"
    bundle.mkdir()
    for filename in ("package.json", "tsconfig.json"):
        shutil.copyfile(ROOT / filename, bundle / filename)
    shutil.copytree(ROOT / "src", bundle / "src")
    (bundle / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    subprocess.run(
        ["node", str(ROOT / "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
        cwd=bundle, check=True,
        env={k: v for k, v in os.environ.items() if k not in ("TYPESAFE_API_KEY", "GEMINI_API_KEY")},
    )
    return bundle


def instrument_plugin(profile, bundle, mock_transport):
    # The production TUI and server entry points still run in the real host.
    # Only provider HTTP responses are replaced, inside this temporary package.
    package = profile / "mock-plugin"
    package.mkdir()
    (package / "package.json").write_text(json.dumps({
        "name": "fast-context-tui-validation", "type": "module",
        "exports": {".": "./server.js", "./tui": "./tui.js"},
    }))
    (package / "tui.js").write_text(f'export {{ default }} from {json.dumps(str(bundle / "dist/tui.js"))};\n')
    (package / "server.js").write_text(f'import plugin from {json.dumps(str(bundle / "dist/index.js"))};\n'
                                       f'const profile = {json.dumps(str(profile))};\n'
                                       f'const mock = {json.dumps(mock_transport)};\n' + """
import { appendFileSync, readFileSync } from "node:fs";
function scenario() {
  try { return readFileSync(`${profile}/scenario`, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return ""; throw error; }
}
export default {
  ...plugin,
  async setup(context) {
    const original = globalThis.fetch;
    if (mock) globalThis.fetch = async (input, init) => {
      const url = String(input);
      const gemini = url === "https://generativelanguage.googleapis.com/v1beta/decisions";
      const jev = url === "https://api.typesafe.ai/v1/models" || url === "https://api.typesafe.ai/v1/systemone";
      if (!gemini && !jev) return original(input, init);
      const headers = new Headers(init?.headers);
      const key = gemini ? headers.get("x-goog-api-key") : headers.get("authorization");
      if (key !== (gemini ? "gemini-test" : "Bearer jev-test")) {
        return new Response(null, { status: 403 });
      }
      if (url.endsWith("/models")) return Response.json({});
      const { questions } = JSON.parse(init.body);
      if (gemini && questions.relevant) {
        const failure = scenario();
        if (failure === "timeout") throw new DOMException("private-fixture-response", "TimeoutError");
        if (["401", "403", "429"].includes(failure)) return new Response("private-fixture-response", { status: Number(failure) });
      }
      return Response.json({
        model: gemini ? "gemini-decision-1" : "validation-jev",
        answers: Object.fromEntries(Object.keys(questions).map((name) => [name, { type: "noul", noul: 0.99 }])),
      });
    };
    const dispose = await plugin.setup({
      ...context,
      storage: {
        ...context.storage,
        async get(key) {
          if (scenario() === "storage-read") throw new Error("private-fixture-response");
          return context.storage.get(key);
        },
        async set(key, value) {
          if (scenario() === "storage-write") throw new Error("private-fixture-response");
          return context.storage.set(key, value);
        },
      },
      tool: {
        ...context.tool,
        transform: (edit) => context.tool.transform((editor) => edit({
          ...editor,
          add: (tool) => editor.add({
            ...tool,
            async execute(...args) {
              const result = await tool.execute(...args);
              const instance = result.metadata.fast_context_instance;
              const provider = result.metadata.fast_context.provider.id;
              appendFileSync(`${profile}/tool-instances.jsonl`, JSON.stringify({ instance, provider }) + "\\n");
              return result;
            },
          }),
        })),
      },
    });
    return async () => {
      globalThis.fetch = original;
      await dispose?.();
    };
  },
};
""")
    return package


def run(mode, profile, output):
    bundle = build_plugin(profile)
    env = {k: v for k, v in os.environ.items() if not k.startswith(("OPENCODE_", "XDG_"))}
    for name, suffix in zip(OPEN_CODE_ENV, ("home", "config", "data", "state", "cache")):
        env[name] = str(profile / suffix)
        Path(env[name]).mkdir()
    env.update(TERM="xterm-256color", COLORTERM="truecolor")
    config = Path(env["XDG_CONFIG_HOME"]) / "opencode"
    config.mkdir()
    project = profile / "project"
    project.mkdir()
    (project / "retry.ts").write_text(FIXTURE)

    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        plugin = bundle if mode == "live" else instrument_plugin(profile, bundle, mode != "wizard")
        (config / "opencode.json").write_text(json.dumps({
            "model": "validation/local",
            "plugins": [plugin.as_uri()],
            "provider": {"validation": {
                "npm": "@ai-sdk/openai-compatible", "name": "Validation",
                "options": {"baseURL": f"http://127.0.0.1:{server.server_port}/v1", "apiKey": "fixture"},
                "models": {"local": {"name": "Fixture", "tool_call": True, "limit": {"context": 65536, "output": 4096}}},
            }},
        }))
        version = subprocess.check_output(["opencode", "--version"], env=env, text=True).strip()
        print(f"{version} | {'live' if mode == 'wizard' else mode} provider transport | isolated profile", flush=True)

        def snapshot(tui, name):
            frame = tui.screen.text()
            forbidden = (env.get("GEMINI_API_KEY"), env.get("TYPESAFE_API_KEY"), "gemini-test", "jev-test", "private-fixture-response")
            if any(value and value in frame for value in forbidden):
                raise RuntimeError("Sensitive data appeared in the terminal frame")
            tui.screen.capture(output / f"{name}.svg")
            print(f"Captured {name}.svg", flush=True)

        def search(tui, provider, index, outcome=None, instance=None, prompt=None):
            previous = len(Model.results)
            tui.enter(f"{QUERY} Validation step {index}.")
            if prompt:
                tui.wait(prompt)
                tui.cancel_prompt(prompt)
            outcome = outcome or ("fallback_required" if provider == "none" else "complete")
            fixture_expected = provider != "none"
            tui.wait(f"Step {index} result: {provider} / {outcome} / fixture {'found' if fixture_expected else 'absent'}", 35)
            if Model.results[previous:] != [(provider, outcome, fixture_expected)]:
                raise RuntimeError(f"Unexpected tool result at step {index}")
            if instance:
                check_tool_instance(instance, provider)

        def check_tool_instance(instance, provider):
            last = json.loads((profile / "tool-instances.jsonl").read_text().splitlines()[-1])
            if last != {"instance": instance, "provider": provider}:
                raise RuntimeError("RPC and tool reached different Fast Context instances; check for duplicate plugin entries")

        def enter_key(tui, provider):
            tui.enter(f"/fast-context auth {provider}")
            tui.wait("Store a Fast Context credential")
            tui.enter(f"{provider}-test")

        def negative_paths(tui, first_instance):
            scenario = profile / "scenario"
            tui.enter("/fast-context provider jev")
            tui.wait("Store a Fast Context credential")
            tui.cancel_prompt("Store a Fast Context credential")
            tui.wait("gemini · connected")
            if tui.provider_status("gemini", "connected") != first_instance:
                raise RuntimeError("Unexpected server change after cancellation")
            search(tui, "gemini", "cancel", instance=first_instance)

            scenario.write_text("storage-write")
            enter_key(tui, "jev")
            tui.wait("Key saved.")
            tui.provider_status("gemini", "connected")
            scenario.unlink()

            scenario.write_text("storage-read")
            tui.wait("status unavailable", 12)
            search(tui, "none", "storage_read")
            scenario.unlink()
            tui.wait("gemini · connected", 12)

        def provider_failures(tui):
            scenario = profile / "scenario"
            for failure in ("429", "timeout", "401", "403"):
                scenario.write_text(failure)
                expired = failure in ("401", "403")
                search(tui, "gemini", f"error_{failure}", "fallback_required",
                       prompt="credential expired" if expired else None)
                tui.wait(f"error ({failure})")
                tui.provider_status("gemini", f"error ({failure})")
                scenario.unlink()
                if expired:
                    enter_key(tui, "gemini")
                    tui.connected("gemini")
            tui.enter("/fast-context auth revoke")
            tui.wait("Revoke Fast Context credential?")
            tui.send("\r")
            tui.wait("gemini · no key")
            tui.provider_status("gemini", "no key")
            search(tui, "none", "revoked", prompt="Connect Fast Context to Google")
            enter_key(tui, "gemini")
            tui.connected("gemini")

        if mode == "wizard":
            print("Paste your Gemini key only when its OpenCode prompt appears. Ctrl+C cancels.", flush=True)
            with terminal_input(), Tui(project, env, mirror=True) as tui:
                tui.wait("Fixture Validation")
                search(tui, "none", "before_auth")
                tui.enter_manual_key()
                instance = tui.provider_status("gemini", "connected")
                search(tui, "gemini", "after_auth", instance=instance)
                snapshot(tui, "gemini-verified")
            print("Gemini status and fast_context_search agreed on the provider and server instance.", flush=True)
            return

        with Tui(project, env) as tui:
            try:
                tui.wait("Fixture Validation")
                search(tui, "none", 1)
                snapshot(tui, "01-unselected")
                for number, provider, key in [
                    ("02", "gemini", "gemini-test"),
                    ("03", "jev", "jev-test"),
                    ("04", "gemini", None),
                ]:
                    if mode == "mock" and number == "03":
                        tui.enter("/fast-context provider jev")
                    elif mode == "mock" and key:
                        enter_key(tui, provider)
                    elif provider == "gemini" and number == "04":
                        tui.enter("/fast-context provider")
                        tui.wait("Select Fast Context provider")
                        snapshot(tui, "04-picker")
                        tui.send("\r")
                    else:
                        tui.enter(f"/fast-context provider {provider}")
                    tui.connected(provider)
                    instance = tui.provider_status(provider, "connected")
                    search(tui, provider, number, instance=instance if mode != "live" else None)
                    snapshot(tui, f"{number}-{provider}")
                    if mode == "mock" and number == "02":
                        negative_paths(tui, instance)
                if mode == "mock":
                    with Tui(project, env) as second:
                        second.wait("Fixture Validation")
                        search(second, "gemini", "second")
                        second_instance = second.provider_status("gemini", "connected")
                        if second_instance == instance:
                            raise RuntimeError("Second TUI did not start another server instance")
                        check_tool_instance(second_instance, "gemini")
                    provider_failures(tui)
            except Exception:
                snapshot(tui, "failure")
                print(f"Observed tool results: {Model.results}; model tool calls: {Model.calls}", flush=True)
                raise
        with Tui(project, env) as tui:
            try:
                tui.wait("Fixture Validation")
                search(tui, "gemini", 5)
                restarted = tui.provider_status("gemini", "connected")
                if mode != "live":
                    check_tool_instance(restarted, "gemini")
                snapshot(tui, "05-restart")
            except Exception:
                snapshot(tui, "restart-failure")
                raise
        server.shutdown()
    print(f"PASS | screenshots: {output}")


def render_png(output, profile):
    if os.uname().sysname != "Darwin" or not shutil.which("swift"):
        return
    cache = profile / "swift-cache"
    try:
        subprocess.run(
            ["swift", "-module-cache-path", str(cache), str(Path(__file__).with_name("render.swift")),
             *(str(frame) for frame in sorted(output.glob("*.svg")))],
            check=True, timeout=40, capture_output=True,
            env={k: v for k, v in os.environ.items() if k not in ("TYPESAFE_API_KEY", "GEMINI_API_KEY")},
        )
    except (OSError, subprocess.SubprocessError):
        print("PNG conversion unavailable. The original SVG frames are saved.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--live", dest="mode", action="store_const", const="live")
    modes.add_argument("--mock", dest="mode", action="store_const", const="mock")
    modes.add_argument("--mock-env", dest="mode", action="store_const", const="mock-env")
    modes.add_argument("--wizard", dest="mode", action="store_const", const="wizard")
    args = parser.parse_args()
    if args.mode in ("mock-env", "live") and any(not os.environ.get(name) for name in ("TYPESAFE_API_KEY", "GEMINI_API_KEY")):
        parser.error("Load both credentials with bash scripts/validate-tui.sh")
    if args.mode == "wizard":
        if not sys.stdin.isatty() or not sys.stdout.isatty():
            parser.error("The self-test wizard requires an interactive terminal")
        for name in ("GEMINI_API_KEY", "TYPESAFE_API_KEY"):
            os.environ.pop(name, None)
        COLS, ROWS = os.get_terminal_size(sys.stdout.fileno())
    base = ROOT / ".validation-output"
    base.mkdir(mode=0o700, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix=f"{args.mode}-", dir=base))
    with tempfile.TemporaryDirectory(prefix="fast-context-tui-") as temporary:
        profile = Path(temporary)
        try:
            run(args.mode, profile, output)
        finally:
            render_png(output, profile)
            print(f"Screenshot directory: {output}", flush=True)
