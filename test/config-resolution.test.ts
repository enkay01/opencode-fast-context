import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveProviderAsync } from "../src/config.ts";

test("environment credential wins and the store is never consulted", async () => {
  let storeReads = 0;
  const resolution = await resolveProviderAsync(
    { TYPESAFE_API_KEY: "env-key" },
    {},
    async () => {
      storeReads += 1;
      return "stored-key";
    },
  );
  assert.ok(resolution.provider);
  assert.equal(resolution.source, "env");
  assert.equal(storeReads, 0);
});

test("stored credential is used when the environment has no key", async () => {
  const resolution = await resolveProviderAsync({}, {}, async () => "stored-key");
  assert.ok(resolution.provider);
  assert.equal(resolution.source, "store");
  assert.equal(resolution.error, null);
});

test("missing credentials report the onboarding paths", async () => {
  const resolution = await resolveProviderAsync({}, {}, async () => undefined);
  assert.equal(resolution.provider, null);
  assert.match(resolution.error ?? "", /TYPESAFE_API_KEY/);
  assert.match(resolution.error ?? "", /\/fast-context auth/);
});

test("without a store resolver the resolution stays environment-only", async () => {
  const resolution = await resolveProviderAsync({});
  assert.equal(resolution.provider, null);
  assert.match(resolution.error ?? "", /TYPESAFE_API_KEY/);
});
