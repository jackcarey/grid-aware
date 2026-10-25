import { afterEach, describe, expect, it, vi } from "vitest";
import { createGridAwareClient } from "../src/client.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stubs `fetch` to return `body` and records the URL of the (single) request made. */
function stubFetch(body: unknown): { requestedUrl(): URL } {
  let requestedUrl: URL | undefined;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    requestedUrl = new URL(input instanceof Request ? input.url : input);
    return jsonResponse(body);
  });
  return {
    requestedUrl() {
      if (!requestedUrl) throw new Error("fetch was never called");
      return requestedUrl;
    },
  };
}

const CURRENT = {
  source: "neso",
  location: { zone: "GB", region: { unknown: true } },
  datetime: "2026-01-01T00:00:00.000Z",
  carbonIntensity: { value: 100, unit: "gCO2eq/kWh", type: "actual", band: "low" },
};

const WITH_FORECAST = {
  ...CURRENT,
  forecast: [
    { datetime: "2026-01-01T00:00:00.000Z", value: 100, type: "actual", band: "low" },
    { datetime: "2026-01-01T01:00:00.000Z", value: 300, type: "forecast", band: "high" },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createGridAwareClient", () => {
  it("getCurrentIntensity requests horizon=latest", async () => {
    const fetchStub = stubFetch(CURRENT);
    const client = createGridAwareClient("https://example.com");

    const data = await client.getCurrentIntensity({ zone: "GB" });

    expect(data.carbonIntensity.value).toBe(100);
    expect(fetchStub.requestedUrl().searchParams.get("horizon")).toBe("latest");
    expect(fetchStub.requestedUrl().searchParams.get("zone")).toBe("GB");
  });

  it("only asks for surplus when the option is set", async () => {
    const fetchStub = stubFetch(CURRENT);
    const client = createGridAwareClient("https://example.com");

    await client.getCurrentIntensity({ zone: "GB" });
    expect(fetchStub.requestedUrl().searchParams.has("surplus")).toBe(false);

    await client.getForecast({ zone: "GB", surplus: true });
    expect(fetchStub.requestedUrl().searchParams.get("surplus")).toBe("true");

    await client.getForecast({ zone: "GB", surplus: 90 });
    expect(fetchStub.requestedUrl().searchParams.get("surplus")).toBe("90");
  });

  it("getForecast defaults to horizon=24h and returns the forecast array", async () => {
    const fetchStub = stubFetch(WITH_FORECAST);
    const client = createGridAwareClient("https://example.com");

    const data = await client.getForecast({ postcode: "SW1A" });

    expect(data.forecast).toHaveLength(2);
    expect(fetchStub.requestedUrl().searchParams.get("horizon")).toBe("24h");
    expect(fetchStub.requestedUrl().searchParams.get("postcode")).toBe("SW1A");
  });

  it("getForecast accepts an explicit horizon", async () => {
    const fetchStub = stubFetch(WITH_FORECAST);
    const client = createGridAwareClient("https://example.com");

    await client.getForecast({ horizon: "48h" });

    expect(fetchStub.requestedUrl().searchParams.get("horizon")).toBe("48h");
  });

  it("getSuggestedWindow asks for surplus sized to the job and returns the window", async () => {
    const window = {
      from: "2026-01-01T02:00:00.000Z",
      to: "2026-01-01T03:30:00.000Z",
      averageIntensity: 42,
      unit: "gCO2eq/kWh",
    };
    const fetchStub = stubFetch({ ...CURRENT, surplus: { derived: { suggested: { window } } } });
    const client = createGridAwareClient("https://example.com");

    const result = await client.getSuggestedWindow({ regionid: 13, durationMinutes: 90 });

    expect(result).toEqual(window);
    expect(fetchStub.requestedUrl().searchParams.get("surplus")).toBe("90");
    expect(fetchStub.requestedUrl().searchParams.get("horizon")).toBe("latest");
    expect(fetchStub.requestedUrl().searchParams.get("regionid")).toBe("13");
  });

  it("getSuggestedWindow defaults the job length and is undefined without a surplus", async () => {
    const fetchStub = stubFetch(CURRENT);
    const client = createGridAwareClient("https://example.com");

    expect(await client.getSuggestedWindow({ zone: "FR" })).toBeUndefined();
    expect(fetchStub.requestedUrl().searchParams.get("surplus")).toBe("true");
  });

  it("throws when the API responds with an error", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 }),
    );
    const client = createGridAwareClient("https://example.com");

    await expect(client.getCurrentIntensity()).rejects.toThrow(/failed to fetch/);
  });
});
