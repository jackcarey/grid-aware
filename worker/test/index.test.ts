import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/ports.js";
import { createInMemoryCacheStore } from "../src/ports.js";

const ALLOWED_ORIGIN = "https://example.com";

function buildDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    electricityMapsToken: "test-token",
    getCountry: () => "GB",
    getPostcode: () => undefined,
    getCity: () => undefined,
    getRegion: () => undefined,
    getColo: () => undefined,
    isOverRegionalRateLimit: async () => false,
    isOverApiRateLimit: async () => false,
    cache: createInMemoryCacheStore(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app: public routes", () => {
  it("serves the OpenAPI spec with no Origin required", async () => {
    const app = createApp(buildDeps());
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { paths: Record<string, unknown> };
    expect(body.paths["/v1/intensity"]).toBeDefined();
  });
});

describe("app: /v1/intensity", () => {
  it("serves NESO national data for a caller with no Origin/Referer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  from: "2026-01-01T00:00Z",
                  to: "2026-01-01T00:30Z",
                  intensity: { actual: 100, forecast: 100, index: "moderate" },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(buildDeps());
    const res = await app.request("/v1/intensity?zone=GB");
    expect(res.status).toBe(200);
  });

  it("serves NESO national data for an allowed UK caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  from: "2026-01-01T00:00Z",
                  to: "2026-01-01T00:30Z",
                  intensity: { actual: 100, forecast: 100, index: "moderate" },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(buildDeps());
    const res = await app.request("/v1/intensity?zone=GB", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      location: { zone?: string };
      carbonIntensity: { band: string };
    };
    expect(body.source).toBe("neso");
    expect(body.carbonIntensity.band).toBe("moderate");
    expect(body.location).toEqual({ zone: "GB", region: { unknown: true } });
  });

  it("falls back to Electricity Maps for zone=GB from a non-UK caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              zone: "GB",
              carbonIntensity: 50,
              datetime: "2026-01-01T00:00:00.000Z",
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(buildDeps({ getCountry: () => "US" }));
    const res = await app.request("/v1/intensity?zone=GB", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      fallback?: { reason: string };
    };
    expect(body.source).toBe("electricitymaps");
    expect(body.fallback?.reason).toMatch(/UK-origin/);
  });

  it("rejects a postcode request from a non-UK caller", async () => {
    const app = createApp(buildDeps({ getCountry: () => "US" }));
    const res = await app.request("/v1/intensity?postcode=SW1A", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when no subject is given and the country can't be detected", async () => {
    const app = createApp(buildDeps({ getCountry: () => undefined }));
    const res = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(400);
  });

  it("defaults to the caller's own country when no subject is given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              zone: "FR",
              carbonIntensity: 42,
              datetime: "2026-01-01T00:00:00.000Z",
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(buildDeps({ getCountry: () => "FR" }));
    const res = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      location: { zone?: string };
    };
    expect(body.source).toBe("electricitymaps");
    expect(body.location).toEqual({ zone: "FR", region: { unknown: true } });
  });

  it("defaults to NESO national for a UK visitor with no subject given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  from: "2026-01-01T00:00Z",
                  to: "2026-01-01T00:30Z",
                  intensity: { actual: 100, forecast: 100, index: "moderate" },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(buildDeps({ getCountry: () => "GB" }));
    const res = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe("neso");
  });

  it("uses NESO regional for a UK visitor whose postcode is edge-detected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  regionid: 13,
                  dnoregion: "London",
                  shortname: "London",
                  data: [
                    {
                      from: "2026-01-01T00:00Z",
                      to: "2026-01-01T00:30Z",
                      intensity: { forecast: 120, index: "moderate" },
                      generationmix: [],
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(
      buildDeps({ getCountry: () => "GB", getPostcode: () => "SW1A" }),
    );
    const res = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      location: { postcode?: string; region?: { name?: string } };
    };
    expect(body.source).toBe("neso");
    expect(body.location.region?.name).toBe("London");
    // location never includes a postcode field, inferred or explicit.
    expect(body.location).not.toHaveProperty("postcode");
  });

  it("falls back to the edge-detected city's DNO region when there's no postcode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  regionid: 8,
                  dnoregion: "West Midlands",
                  shortname: "West Midlands",
                  data: [
                    {
                      from: "2026-01-01T00:00Z",
                      to: "2026-01-01T00:30Z",
                      intensity: { forecast: 150, index: "moderate" },
                      generationmix: [],
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(
      buildDeps({
        getCountry: () => "GB",
        getPostcode: () => undefined,
        getCity: () => "Birmingham",
      }),
    );
    const res = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      location: { region?: { name?: string } };
    };
    expect(body.source).toBe("neso");
    expect(body.location.region?.name).toBe("West Midlands");
  });

  it("falls back to the detected nation when neither postcode nor city are known", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  from: "2026-01-01T00:00Z",
                  to: "2026-01-01T00:30Z",
                  intensity: { actual: 100, forecast: 100, index: "moderate" },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(
      buildDeps({
        getCountry: () => "GB",
        getPostcode: () => undefined,
        getCity: () => "Nowheresville",
        getRegion: () => "Scotland",
      }),
    );
    const res = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      location: { region?: { nation?: string; unknown?: boolean } };
    };
    expect(body.source).toBe("neso");
    expect(body.location.region).toEqual({
      nation: "Scotland",
      unknown: false,
    });
  });

  it("falls back to the serving colo's city (an IATA code) when there's no postcode or city", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  regionid: 3,
                  dnoregion: "North West England",
                  shortname: "North West England",
                  data: [
                    {
                      from: "2026-01-01T00:00Z",
                      to: "2026-01-01T00:30Z",
                      intensity: { forecast: 100, index: "moderate" },
                      generationmix: [],
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(
      buildDeps({
        getCountry: () => "GB",
        getPostcode: () => undefined,
        getCity: () => undefined,
        getRegion: () => undefined,
        getColo: () => "MAN",
      }),
    );
    const res = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      location: { region?: { name?: string } };
    };
    expect(body.source).toBe("neso");
    expect(body.location.region?.name).toBe("North West England");
  });

  it("shares one NESO all-regions fetch once regional traffic is rate-limited", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                regionid: 3,
                dnoregion: "North West England",
                shortname: "North West England",
                data: [
                  {
                    from: "2026-01-01T00:00Z",
                    to: "2026-01-01T00:30Z",
                    intensity: { forecast: 100, index: "moderate" },
                    generationmix: [],
                  },
                ],
              },
              {
                regionid: 8,
                dnoregion: "West Midlands",
                shortname: "West Midlands",
                data: [
                  {
                    from: "2026-01-01T00:00Z",
                    to: "2026-01-01T00:30Z",
                    intensity: { forecast: 150, index: "moderate" },
                    generationmix: [],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Same cache store for both - they represent two visitors hitting one deployed worker.
    const cache = createInMemoryCacheStore();
    const isOverRegionalRateLimit = async () => true;
    const manchester = createApp(
      buildDeps({
        getCountry: () => "GB",
        getCity: () => "Manchester",
        cache,
        isOverRegionalRateLimit,
      }),
    );
    const explicitLondon = createApp(
      buildDeps({ cache, isOverRegionalRateLimit }),
    );

    const first = await manchester.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const firstBody = (await first.json()) as {
      location: { region?: { name?: string } };
    };
    expect(firstBody.location.region?.name).toBe("North West England");

    // An explicit regionid is just as fungible for the shared fetch once rate-limited.
    const second = await explicitLondon.request("/v1/intensity?regionid=8", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const secondBody = (await second.json()) as {
      location: { region?: { name?: string } };
    };
    expect(secondBody.location.region?.name).toBe("West Midlands");

    // Two different requests, but only one upstream call - served from the shared cache.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches per-request while under the regional rate limit, regardless of an explicit regionid", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const regionId = Number(new URL(url).pathname.split("/").pop());
      return new Response(
        JSON.stringify({
          data: [
            {
              regionid: regionId,
              dnoregion: `Region ${regionId}`,
              shortname: `Region ${regionId}`,
              data: [
                {
                  from: "2026-01-01T00:00Z",
                  to: "2026-01-01T00:30Z",
                  intensity: { forecast: 100, index: "moderate" },
                  generationmix: [],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp(buildDeps());
    await app.request("/v1/intensity?regionid=3", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    await app.request("/v1/intensity?regionid=8", {
      headers: { Origin: ALLOWED_ORIGIN },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the detected nation when postcode, city, and colo all fail to resolve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  from: "2026-01-01T00:00Z",
                  to: "2026-01-01T00:30Z",
                  intensity: { actual: 100, forecast: 100, index: "moderate" },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(
      buildDeps({
        getCountry: () => "GB",
        getPostcode: () => undefined,
        getCity: () => undefined,
        getRegion: () => "England",
        getColo: () => "DFW",
      }),
    );
    const res = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      location: { region?: { nation?: string; unknown?: boolean } };
    };
    expect(body.location.region).toEqual({ nation: "England", unknown: false });
  });

  it("normalizes an explicit postcode to its outward code before querying NESO, and never echoes it back", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/regional/postcode/SW1A");
      return new Response(
        JSON.stringify({
          data: [
            {
              regionid: 13,
              dnoregion: "London",
              shortname: "London",
              data: [
                {
                  from: "2026-01-01T00:00Z",
                  to: "2026-01-01T00:30Z",
                  intensity: { forecast: 120, index: "moderate" },
                  generationmix: [],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp(buildDeps({ getCountry: () => "GB" }));
    const res = await app.request("/v1/intensity?postcode=SW1A%201AA", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { location: { postcode?: string } };
    expect(body.location).not.toHaveProperty("postcode");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores the edge-detected postcode once a zone/postcode/regionid is given explicitly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              zone: "FR",
              carbonIntensity: 10,
              datetime: "2026-01-01T00:00:00.000Z",
            }),
            { status: 200 },
          ),
      ),
    );

    const app = createApp(
      buildDeps({ getCountry: () => "GB", getPostcode: () => "SW1A" }),
    );
    const res = await app.request("/v1/intensity?zone=FR", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe("electricitymaps");
  });

  it("caches auto-detected responses separately per visitor country", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const requestedZone = new URL(url).searchParams.get("zone");
      return new Response(
        JSON.stringify({
          zone: requestedZone,
          carbonIntensity: requestedZone === "FR" ? 1 : 2,
          datetime: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    let country = "FR";
    const app = createApp(buildDeps({ getCountry: () => country }));

    const first = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const firstBody = (await first.json()) as {
      carbonIntensity: { value: number };
    };
    expect(firstBody.carbonIntensity.value).toBe(1);

    country = "DE";
    const second = await app.request("/v1/intensity", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const secondBody = (await second.json()) as {
      carbonIntensity: { value: number };
    };
    expect(secondBody.carbonIntensity.value).toBe(2);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to an unknown reading instead of erroring when Electricity Maps is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const app = createApp(buildDeps());
    const res = await app.request("/v1/intensity?zone=FR", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      carbonIntensity: { value: number | null; band: string };
      fallback?: { reason: string };
    };
    expect(body.carbonIntensity.value).toBeNull();
    expect(body.carbonIntensity.band).toBe("unknown");
    expect(body.fallback?.reason).toMatch(/Electricity Maps/);
  });

  it("does not cache an unknown fallback, so the next request retries upstream", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            zone: "FR",
            carbonIntensity: 42,
            datetime: "2026-01-01T00:00:00.000Z",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp(buildDeps());
    const first = await app.request("/v1/intensity?zone=FR", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const firstBody = (await first.json()) as {
      carbonIntensity: { band: string };
    };
    expect(firstBody.carbonIntensity.band).toBe("unknown");

    const second = await app.request("/v1/intensity?zone=FR", {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const secondBody = (await second.json()) as {
      carbonIntensity: { band: string };
    };
    expect(secondBody.carbonIntensity.band).toBe("low");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches auto-detected responses separately per detected postcode", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                regionid: 13,
                dnoregion: "London",
                shortname: "London",
                data: [
                  {
                    from: "2026-01-01T00:00Z",
                    to: "2026-01-01T00:30Z",
                    intensity: { forecast: 100, index: "moderate" },
                    generationmix: [],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    let postcode = "SW1A";
    const app = createApp(
      buildDeps({ getCountry: () => "GB", getPostcode: () => postcode }),
    );

    await app.request("/v1/intensity", { headers: { Origin: ALLOWED_ORIGIN } });
    postcode = "RG41";
    await app.request("/v1/intensity", { headers: { Origin: ALLOWED_ORIGIN } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("app: /v1/zones", () => {
  it("proxies the zone list for any origin, with no allowlist check", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ FR: { zoneName: "France" } }), {
            status: 200,
          }),
      ),
    );
    const app = createApp(buildDeps());
    const res = await app.request("/v1/zones", {
      headers: { Origin: "https://anywhere.example" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
