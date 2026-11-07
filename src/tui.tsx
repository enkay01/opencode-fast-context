import { Plugin, usePlugin } from "@opencode/plugin/tui";
import type { InputRenderable } from "@opentui/core";
import { createSignal, onMount, Show } from "solid-js";
import { FastContextAuthRpc } from "./auth-rpc.ts";
import {
  FAST_CONTEXT_INTEGRATION_ID,
  fastContextCredentialEntries,
  replacementRemoval,
} from "./credentials.ts";
import { applyMaskDelta, createMaskState, SECRET_MASK } from "./mask.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AuthRequestEvent {
  requestId: string;
  reason: "missing" | "expired";
}

/** Masked single-line key entry; the renderable only ever shows mask characters. */
function MaskedKeyPrompt(props: {
  title: string;
  description: string;
  placeholder?: string;
  submit: (key: string) => Promise<string | undefined>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const context = usePlugin();
  const theme = context.theme.surface("dialog");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const mask = createMaskState();
  let input: InputRenderable | undefined;

  const handleInput = (text: string) => {
    if (busy()) return;
    const buffer = input?.plainText ?? text;
    const next = applyMaskDelta(mask, buffer);
    mask.secret = next.secret;
    mask.shown = next.shown;
    if (input && input.plainText !== next.shown) {
      input.value = next.shown;
      input.gotoLineEnd();
    }
  };

  const handleSubmit = async () => {
    if (busy()) return;
    const key = mask.secret;
    if (!key) {
      setError("Enter your TypeSafe API key.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const failure = await props.submit(key);
      if (failure === undefined) {
        props.onDone();
        return;
      }
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  context.keymap.layer(() => ({
    mode: "modal",
    commands: [
      {
        bind: "escape",
        title: "Cancel",
        group: "Fast Context",
        run: () => props.onCancel(),
      },
    ],
  }));

  onMount(() => {
    setTimeout(() => input?.focus(), 1);
  });

  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text fg={theme.text.base}>{props.title}</text>
      <text fg={theme.text.muted}>{props.description}</text>
      <input
        ref={(el: InputRenderable | undefined) => {
          input = el;
        }}
        placeholder={props.placeholder ?? "TypeSafe API key"}
        maxLength={512}
        onInput={handleInput}
        onSubmit={() => void handleSubmit()}
      />
      <Show when={error()}>{(message: () => string) => <text fg={theme.text.feedback.error.base}>{message()}</text>}</Show>
      <text fg={theme.text.faint}>
        {busy() ? "Verifying with TypeSafe…" : `Enter to save · Esc to cancel · input shows ${SECRET_MASK} per character`}
      </text>
    </box>
  );
}

export default Plugin.define({
  id: "fast-context",
  async setup(context) {
    const client = context.client.rpc(FastContextAuthRpc);
    const api = context.client;

    // The server part registers the RPC during its own setup; retry briefly
    // so attach does not fail on startup ordering.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await client.attach({});
        break;
      } catch {
        if (attempt === 19) break;
        await sleep(250);
      }
    }

    const removeStoredCredentials = async () => {
      const entries = await api.credential.list();
      for (const entry of replacementRemoval(entries)) {
        await api.credential.remove({ credentialID: entry.id });
      }
    };

    const removeAllCredentials = async () => {
      const entries = await api.credential.list();
      for (const entry of fastContextCredentialEntries(entries)) {
        await api.credential.remove({ credentialID: entry.id });
      }
    };

    /** Shows the masked prompt; resolves after save or cancel. */
    const collectKey = (options: {
      title: string;
      description: string;
      requestId?: string;
    }): Promise<"saved" | "cancelled"> =>
      new Promise((resolve) => {
        let settled = false;
        const finish = (outcome: "saved" | "cancelled") => {
          if (settled) return;
          settled = true;
          context.ui.dialog.clear();
          resolve(outcome);
        };
        const cancel = () => {
          if (options.requestId) void client.cancel({ requestId: options.requestId }).catch(() => {});
          finish("cancelled");
        };
        context.ui.dialog.show(
          () => (
            <MaskedKeyPrompt
              title={options.title}
              description={options.description}
              submit={async (key) => {
                try {
                  const result = (await client.submitKey({
                    ...(options.requestId ? { requestId: options.requestId } : {}),
                    key,
                  })) as { ok: boolean; error?: string };
                  if (result.ok) {
                    finish("saved");
                    return undefined;
                  }
                  return result.error ?? "Could not save the key.";
                } catch {
                  return "Could not reach the OpenCode server. Try again.";
                }
              }}
              onDone={() => finish("saved")}
              onCancel={cancel}
            />
          ),
          () => {
            if (options.requestId) void client.cancel({ requestId: options.requestId }).catch(() => {});
            finish("cancelled");
          },
        );
      });

    // Server-initiated prompts are serialized so concurrent searches do not
    // fight over the single modal dialog.
    const queue: Array<() => Promise<void>> = [];
    let draining = false;
    const enqueue = (task: () => Promise<void>) => {
      queue.push(task);
      if (draining) return;
      draining = true;
      void (async () => {
        while (queue.length > 0) await queue.shift()!();
        draining = false;
      })();
    };

    const handleRequest = (event: AuthRequestEvent) => {
      enqueue(async () => {
        if (event.reason === "expired") {
          try {
            await removeStoredCredentials();
          } catch {
            // The prompt still offers a replacement key.
          }
        }
        const title =
          event.reason === "expired"
            ? "Fast Context credential expired"
            : "Connect Fast Context to TypeSafe";
        const description =
          event.reason === "expired"
            ? "The stored key was rejected by TypeSafe. Enter a replacement key; it is verified live and saved in OpenCode's credential store."
            : "Fast Context needs a TypeSafe API key for Jev ranking. Enter it once; it is verified live and saved in OpenCode's credential store, not in this project.";
        await collectKey({ title, description, requestId: event.requestId });
      });
    };

    const unsubscribe = client.events.on("request", (event) => {
      handleRequest(event.data as unknown as AuthRequestEvent);
    });

    const showStatus = async () => {
      try {
        const status = (await client.status({})) as { env: boolean; stored: boolean };
        const sources: string[] = [];
        if (status.env) sources.push("process.env.TYPESAFE_API_KEY (active; takes precedence)");
        if (status.stored) sources.push(`OpenCode credential store (${FAST_CONTEXT_INTEGRATION_ID})`);
        const lines = sources.map((source) => `- ${source}`);
        await context.ui.dialog.alert({
          title: "Fast Context auth",
          message:
            sources.length === 0
              ? "No credential configured. Set TYPESAFE_API_KEY or run /fast-context auth to store a key."
              : ["Credential sources:", ...lines].join("\n"),
        });
      } catch {
        context.ui.toast.show({ title: "Fast Context", message: "Could not read credential status.", variant: "error" });
      }
    };

    const promptAndSave = async () => {
      await collectKey({
        title: "Store a Fast Context credential",
        description:
          "Enter your TypeSafe API key. It is verified live, then saved in OpenCode's credential store. The key is never written to this project or your shell profile.",
      });
      context.ui.toast.show({ title: "Fast Context", message: "Credential updated.", variant: "success" });
    };

    const revoke = async () => {
      const confirmed = await context.ui.dialog.confirm({
        title: "Revoke Fast Context credential?",
        message: "This removes every Fast Context key stored in OpenCode's credential store. TYPESAFE_API_KEY in the environment is not affected.",
        label: { confirm: "Revoke", cancel: "Keep" },
      });
      if (!confirmed) return;
      try {
        await removeAllCredentials();
        context.ui.toast.show({ title: "Fast Context", message: "Stored credential revoked.", variant: "success" });
      } catch {
        context.ui.toast.show({ title: "Fast Context", message: "Could not revoke the credential.", variant: "error" });
      }
    };

    const runAuthCommand = async (input: string) => {
      const command = input.trim().split(/\s+/).filter(Boolean)[0] ?? "";
      if (command === "" || command === "login" || command === "set" || command === "key") {
        await promptAndSave();
        return;
      }
      if (command === "status") {
        await showStatus();
        return;
      }
      if (command === "revoke" || command === "logout" || command === "remove") {
        await revoke();
        return;
      }
      if (command === "help") {
        await context.ui.dialog.alert({
          title: "Fast Context auth",
          message: "/fast-context auth - store or replace the TypeSafe key\n/fast-context auth status - show credential sources\n/fast-context auth revoke - remove stored keys",
        });
        return;
      }
      context.ui.toast.show({
        title: "Fast Context",
        message: `Unknown auth command "${command}". Try /fast-context auth help.`,
        variant: "warning",
      });
    };

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "fast-context.auth",
          title: "Fast Context auth",
          description: "Store, inspect, or revoke the TypeSafe credential",
          group: "Fast Context",
          palette: true,
          slash: { name: "fast-context", arguments: true },
          run: async (input) => {
            await runAuthCommand(input ?? "");
          },
        },
      ],
    }));

    return () => {
      unsubscribe();
      void client.detach({}).catch(() => {});
    };
  },
});
