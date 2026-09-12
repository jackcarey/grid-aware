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

  it("throws UpstreamError on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(getNationalIntensity("latest")).rejects.toThrow(UpstreamError);
  });
});
