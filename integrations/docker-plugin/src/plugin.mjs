const BANDS = ["low", "moderate", "high"];
const MAX_MINUTES = 2880;

/**
 * Settings are GRID_AWARE_<NAME> variables. PLUGIN_<NAME> is accepted too, because that is how
 * Drone-style CIs hand a step's settings to a container.
 */
export function readSettings(env) {
  const get = (name) => (env[`GRID_AWARE_${name}`] ?? env[`PLUGIN_${name}`])?.trim() || undefined;
  const minutes = (name, fallback) => {
    const raw = get(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > MAX_MINUTES) {
      throw new Error(`${name.toLowerCase()} must be a whole number of minutes from 1 to ${MAX_MINUTES}, got "${raw}"`);
    }
    return value;
  };
  const band = get("MAX_BAND");
  if (band && !BANDS.includes(band)) {
    throw new Error(`max_band must be low, moderate or high, got "${band}"`);
  }
  return {
    apiUrl: get("API_URL"),
    origin: get("ORIGIN"),
    zone: get("ZONE"),
    postcode: get("POSTCODE"),
    regionId: get("REGIONID"),
    band,
    durationMinutes: minutes("DURATION_MINUTES", 30),
    maxWaitMinutes: minutes("MAX_WAIT_MINUTES", 360),
    tickMinutes: minutes("TICK_MINUTES", 30),
  };
}

export function buildUrl(settings) {
  const params = new URLSearchParams();
  if (settings.zone) params.set("zone", settings.zone);
  if (settings.postcode) params.set("postcode", settings.postcode);
  if (settings.regionId) params.set("regionid", settings.regionId);
  params.set("duration", String(settings.durationMinutes));
  params.set("within", String(settings.maxWaitMinutes));
  if (settings.band) params.set("band", settings.band);
  return `${settings.apiUrl.replace(/\/+$/, "")}/v2/suggest?${params}`;
}

/**
 * Works out when to start and reports it. It never fails the step because of the grid, so work is
 * not dropped: what happens next is up to the pipeline. If the API can't be reached the answer is
 * "now". Returns the process exit code.
 */
export async function run(env, { fetch = globalThis.fetch, log = console.log, writeOutput, now = () => new Date() } = {}) {
  const settings = readSettings(env);
  const asked = now();
  const immediately = (reason) => {
    log(`grid-aware: ${reason}, starting now`);
    writeOutput?.({ GRID_AWARE_START: asked.toISOString(), GRID_AWARE_DELAY_SECONDS: "0", GRID_AWARE_DIRTY: "false" });
    return 0;
  };
  if (!settings.apiUrl) return immediately("no api_url set");

  let body;
  try {
    const response = await fetch(buildUrl(settings), {
      // The API only answers allowlisted origins, and a container sends none of its own.
      headers: { Accept: "application/json", ...(settings.origin && { Origin: settings.origin }) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    body = await response.json();
  } catch (error) {
    return immediately(`lookup failed (${error.message})`);
  }

  const start = new Date(body?.start);
  if (Number.isNaN(start.getTime())) return immediately("the answer had no start time");

  const delaySeconds = Math.max(0, Math.ceil((start.getTime() - asked.getTime()) / 1000));
  // Later than the next tick would catch: the work should wait for the start time.
  const dirty = delaySeconds > settings.tickMinutes * 60;
  const note = body.withinBand === false ? "; no window met the band, so this is the cleanest" : "";
  log(
    delaySeconds === 0
      ? `grid-aware: the best time to start is now${note}`
      : `grid-aware: the best time to start is ${start.toISOString()}, in ${Math.round(delaySeconds / 60)} minutes${note}`,
  );

  writeOutput?.({
    GRID_AWARE_START: new Date(Math.max(start.getTime(), asked.getTime())).toISOString(),
    GRID_AWARE_DELAY_SECONDS: String(delaySeconds),
    GRID_AWARE_DIRTY: String(dirty),
  });
  return 0;
}
