import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthBroker, type AuthRequestEvent } from "../src/auth-broker.ts";

function makeBroker(options?: { activeCredentialID?: string; timeoutMs?: number; storedKey?: string }) {
  const events: AuthRequestEvent[] = [];
  let storedKey = options?.storedKey;
  const broker = createAuthBroker({
    resolveStored: async () => storedKey,
    activeCredentialID: async () => options?.activeCredentialID,
    ...(options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  broker.setEmit(async (event) => {
    events.push(event);
  });
  return {
    broker,
    events,
    setStoredKey: (key: string | undefined) => {
      storedKey = key;
    },
  };
}

async function waitForEvents(events: AuthRequestEvent[], count: number) {
  for (let i = 0; i < 100 && events.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(events.length >= count, `expected ${count} auth event(s), saw ${events.length}`);
}

test("only a session an attached client reports can prompt", async () => {
  const { broker, events } = makeBroker();
  assert.equal(await broker.broker.requestAuth?.("missing", undefined, "s1"), "unavailable");

  broker.attach(["s1"]);
  assert.equal(await broker.broker.requestAuth?.("missing", undefined, "s2"), "unavailable");
  assert.equal(events.length, 0);

  const pending = broker.broker.requestAuth?.("missing", undefined, "s1");
  await waitForEvents(events, 1);
  broker.settle(events[0]!.requestId, "saved");
  assert.equal(await pending, "saved");
});

test("a request without a session id never waits for a prompt", async () => {
  const { broker, events } = makeBroker();
  broker.attach(["s1"]);
  assert.equal(await broker.broker.requestAuth?.("missing"), "unavailable");
  assert.equal(events.length, 0);
});

test("detach settles pending requests as cancelled", async () => {
  const { broker, events } = makeBroker();
  broker.attach(["s1"]);
  const pending = broker.broker.requestAuth?.("missing", undefined, "s1");
  await waitForEvents(events, 1);
  assert.equal(broker.pendingCount(), 1);
  broker.detach();
  assert.equal(await pending, "cancelled");
  assert.equal(broker.pendingCount(), 0);
});

test("a prompt that is never answered times out", async () => {
  const { broker, events } = makeBroker({ timeoutMs: 10 });
  broker.attach(["s1"]);
  const pending = broker.broker.requestAuth?.("missing", undefined, "s1");
  await waitForEvents(events, 1);
  assert.equal(await pending, "cancelled");
  assert.equal(broker.pendingCount(), 0);
});

test("an aborted search settles the prompt immediately", async () => {
  const { broker } = makeBroker();
  broker.attach(["s1"]);
  const controller = new AbortController();
  const pending = broker.broker.requestAuth?.("missing", controller.signal, "s1");
  controller.abort();
  assert.equal(await pending, "cancelled");
});

test("a rejected stored credential is queued for client cleanup and skipped afterwards", async () => {
  const { broker, setStoredKey } = makeBroker({ activeCredentialID: "cred-1", storedKey: "expired-key" });
  broker.attach(["s1"]);

  await broker.broker.discardStored?.();
  assert.deepEqual(broker.attach(["s1"]), { remove: ["cred-1"] });

  setStoredKey("expired-key");
  assert.equal(await broker.broker.resolveStored(), undefined);

  broker.acknowledge(["cred-1"]);
  assert.deepEqual(broker.attach(["s1"]), { remove: [] });
  assert.equal(await broker.broker.resolveStored(), "expired-key");
});

test("dispose settles pending requests and refuses new prompts", async () => {
  const { broker, events } = makeBroker();
  broker.attach(["s1"]);
  const pending = broker.broker.requestAuth?.("missing", undefined, "s1");
  await waitForEvents(events, 1);
  broker.dispose();
  assert.equal(await pending, "cancelled");
  assert.equal(await broker.broker.requestAuth?.("missing", undefined, "s1"), "unavailable");
});
