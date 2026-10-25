import { afterEach, describe, expect, it, vi } from "vitest";
import { BadLocationError, queryNeso } from "../src/neso.js";

const period = (from: string, forecast: number) => ({
  from,
  to: `${from}+30m`,
  intensity: { forecast, index: "moderate" },
  generationmix: [{ fuel: "wind", perc: 40 }],
});

const region = (regionid: number, shortname: string, periods = [period("a", 120)]) => ({
  regionid,
  dnoregion: `${shortname} DNO`,
  shortname,
  data: periods,
});

function mockFetch(handler: (url: string) => unknown) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify(handler(String(url))));
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("queryNeso", () => {
  it("returns a grid-intensity style record for a region id", async () => {
    const calls = mockFetch(() => ({ data: [region(13, "London")] }));
    expect(await queryNeso("13")).toEqual([
      {
        emissions_type: "average",
        metric_type: "absolute",
        provider: "NESO",
        location: "London",
        units: "gCO2e per kWh",
        valid_from: "a",
        valid_to: "a+30m",
        value: 120,
        is_estimated: true,
      },
    ]);
    expect(calls[0]).toContain("/regional/regionid/13");
  });

  it("cuts a full postcode to its outward code", async () => {
    const calls = mockFetch(() => ({ data: [region(13, "London")] }));
    await queryNeso("sw1a 1aa");
    expect(calls[0]).toContain("/regional/postcode/SW1A");
  });

  it("finds a region by name", async () => {
    // The all-regions endpoint groups by period, with the region's intensity on each entry.
    const { data, ...rest } = region(13, "London");
    mockFetch(() => ({ data: [{ from: "a", to: "b", regions: [{ ...rest, ...data[0] }] }] }));
    expect((await queryNeso("london"))[0]?.location).toBe("London");
  });

  it("uses the best window from the 48h series when asked", async () => {
    const periods = [period("a", 200), period("b", 100), period("c", 50), period("d", 300)];
    const calls = mockFetch(() => ({ data: region(13, "London", periods) }));
    const [record] = await queryNeso("13", { windowMinutes: 60 });
    expect(calls[0]).toContain("fw48h");
    expect(record).toMatchObject({ valid_from: "b", valid_to: "c+30m", value: 75, is_estimated: true });
  });

  it("fails when the forecast is too short for the window", async () => {
    mockFetch(() => ({ data: region(13, "London") }));
    await expect(queryNeso("13", { windowMinutes: 120 })).rejects.toThrow(/too short/);
  });

  it("rejects out-of-range ids", async () => {
    await expect(queryNeso("15")).rejects.toBeInstanceOf(BadLocationError);
  });
});
