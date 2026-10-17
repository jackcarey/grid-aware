import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "../../src/errors.js";
import {
  getNationalIntensity,
  getRegionalByPostcode,
  getRegionalByRegionId,
  getRegionalNational,
} from "../../src/providers/neso.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("neso provider", () => {
  it("hits the plain /intensity endpoint for horizon=latest", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getNationalIntensity("latest");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.carbonintensity.org.uk/intensity");
  });

  it("hits the fw24h/fw48h forecast endpoints for other horizons", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getRegionalNational("24h");
    const url = fetchMock.mock.calls[0]![0];
    expect(url).toMatch(/^https:\/\/api\.carbonintensity\.org\.uk\/regional\/intensity\/.+\/fw24h$/);
  });

  it("builds postcode and regionid regional URLs", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getRegionalByPostcode("SW1A", "latest");
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.carbonintensity.org.uk/regional/postcode/SW1A",
    );

    await getRegionalByRegionId(13, "latest");
    expect(fetchMock.mock.calls[1]![0]).toBe(
      "https://api.carbonintensity.org.uk/regional/regionid/13",
    );
  });

  it("wraps a forward single-region response, which NESO returns as an object", async () => {
    const region = { regionid: 13, dnoregion: "London", shortname: "London", data: [] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: region }), { status: 200 })));
    expect(await getRegionalByRegionId(13, "48h")).toEqual({ data: [region] });
  });

  it("regroups all-regions data by region", async () => {
    const entry = (regionid: number, forecast: number) => ({
      regionid,
      dnoregion: `Region ${regionid}`,
      shortname: `Region ${regionid}`,
      intensity: { forecast, index: "low" },
      generationmix: [],
    });
    const periods = [
      { from: "2026-01-01T00:00Z", to: "2026-01-01T00:30Z", regions: [entry(1, 10), entry(2, 20)] },
      { from: "2026-01-01T00:30Z", to: "2026-01-01T01:00Z", regions: [entry(1, 11), entry(2, 21)] },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: periods }), { status: 200 })));
    const { data } = await getRegionalNational("latest");
    expect(data.map((r) => r.regionid)).toEqual([1, 2]);
    expect(data[1]!.data.map((p) => p.intensity.forecast)).toEqual([20, 21]);
    expect(data[1]!.data[1]!.from).toBe("2026-01-01T00:30Z");
  });

  it("throws UpstreamError on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(getNationalIntensity("latest")).rejects.toThrow(UpstreamError);
  });
});
