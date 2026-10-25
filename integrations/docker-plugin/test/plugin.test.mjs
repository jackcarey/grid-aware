import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUrl, readSettings, run } from "../src/plugin.mjs";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const at = (minutes) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const reply = (body) => async () => ({ ok: true, json: async () => body });
const env = (overrides = {}) => ({ PLUGIN_API_URL: "https://api.example.com/", ...overrides });
const options = (extra = {}) => ({ log: () => {}, now: () => NOW, ...extra });

test("reports a later start as the delay, and marks the grid as not ready", async () => {
  let output;
  const code = await run(env(), options({ fetch: reply({ start: at(180) }), writeOutput: (v) => (output = v) }));
  assert.equal(code, 0);
  assert.deepEqual(output, {
    GRID_AWARE_START: at(180),
    GRID_AWARE_DELAY_SECONDS: "10800",
    GRID_AWARE_DIRTY: "true",
  });
});

test("never fails because of the grid, however far off the best time is", async () => {
  assert.equal(await run(env(), options({ fetch: reply({ start: at(2000) }) })), 0);
});

test("a start within a tick is not dirty", async () => {
  let output;
  await run(env(), options({ fetch: reply({ start: at(20) }), writeOutput: (v) => (output = v) }));
  assert.equal(output.GRID_AWARE_DIRTY, "false");
  assert.equal(output.GRID_AWARE_DELAY_SECONDS, "1200");
});

test("a start in the past is now", async () => {
  let output;
  await run(env(), options({ fetch: reply({ start: at(-10) }), writeOutput: (v) => (output = v) }));
  assert.equal(output.GRID_AWARE_DELAY_SECONDS, "0");
  assert.equal(output.GRID_AWARE_START, NOW.toISOString());
});

test("an unreachable API, a bad answer or no api_url all mean start now", async () => {
  for (const [name, settings, fetch] of [
    ["http error", env(), async () => ({ ok: false, status: 503 })],
    ["network error", env(), async () => { throw new Error("offline"); }],
    ["no start", env(), reply({ unit: "gCO2eq/kWh" })],
    ["no api_url", {}, reply({ start: at(180) })],
  ]) {
    let output;
    assert.equal(await run(settings, options({ fetch, writeOutput: (v) => (output = v) })), 0, name);
    assert.equal(output.GRID_AWARE_DELAY_SECONDS, "0", name);
    assert.equal(output.GRID_AWARE_DIRTY, "false", name);
  }
});

test("says when no window met the band", async () => {
  const logs = [];
  await run(env({ PLUGIN_MAX_BAND: "low" }), options({ fetch: reply({ start: at(60), withinBand: false }), log: (m) => logs.push(m) }));
  assert.match(logs.join("\n"), /no window met the band/);
});

test("asks for the job length, the deadline and the band", async () => {
  let url;
  await run(
    env({ PLUGIN_ORIGIN: "https://ci.example.com", PLUGIN_POSTCODE: "SW1A", PLUGIN_MAX_BAND: "moderate", PLUGIN_DURATION_MINUTES: "90" }),
    options({
      fetch: async (u, init) => {
        url = { u, init };
        return reply({ start: at(0) })();
      },
    }),
  );
  assert.equal(url.init.headers.Origin, "https://ci.example.com");
  assert.equal(url.u, "https://api.example.com/v2/suggest?postcode=SW1A&duration=90&within=360&band=moderate");
});

test("GRID_AWARE_ variables work without any CI prefix, and win over PLUGIN_", () => {
  const settings = readSettings({
    GRID_AWARE_API_URL: "https://api.example.com",
    GRID_AWARE_MAX_BAND: "low",
    PLUGIN_MAX_BAND: "high",
  });
  assert.equal(settings.apiUrl, "https://api.example.com");
  assert.equal(settings.band, "low");
  assert.match(buildUrl(settings), /band=low/);
});

test("rejects bad settings", () => {
  assert.throws(() => readSettings(env({ PLUGIN_MAX_BAND: "very-high" })), /max_band/);
  assert.throws(() => readSettings(env({ PLUGIN_MAX_WAIT_MINUTES: "0" })), /max_wait_minutes/);
  assert.throws(() => readSettings(env({ PLUGIN_DURATION_MINUTES: "abc" })), /duration_minutes/);
});
