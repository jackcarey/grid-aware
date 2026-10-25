import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "../../src/errors.js";
import { getForecast, getLatestIntensity, listZones } from "../../src/providers/electricityMaps.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("electricityMaps provider", () => {
  it("sends the auth-token header and zone param for getLatestIntensity", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ zone: "FR", carbonIntensity: 42, datetime: "now" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLatestIntensity("tok123", "FR");
    expect(result.carbonIntensity).toBe(42);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url.toString()).toBe("https://api.electricitymap.org/v3/carbon-intensity/latest?zone=FR");
    expect((init?.headers as Record<string, string>)["auth-token"]).toBe("tok123");
  });

  it("maps horizon to hours for getForecast", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ zone: "FR", forecast: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getForecast("tok123", "FR", "48h");
    const [url] = fetchMock.mock.calls[0]!;
    expect(url.searchParams.get("horizon")).toBe("48");
  });

  it("throws UpstreamError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(getLatestIntensity("tok123", "FR")).rejects.toThrow(UpstreamError);
  });

  it("throws UpstreamError when fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(listZones("tok123")).rejects.toThrow(UpstreamError);
  });
});
