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

  it("throws when the API responds with an error", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 }),
    );
    const client = createGridAwareClient("https://example.com");

    await expect(client.getCurrentIntensity()).rejects.toThrow(/failed to fetch/);
  });
});
