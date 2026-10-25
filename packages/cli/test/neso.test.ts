import { afterEach, describe, expect, it, vi } from "vitest";
import { BadLocationError, queryNeso } from "../src/neso.js";

const region = (regionid: number, shortname: string) => ({
  regionid,
  dnoregion: `${shortname} DNO`,
  shortname,
  data: [
    {
      from: "2026-10-25T10:00Z",
      to: "2026-10-25T10:30Z",
      intensity: { forecast: 120, index: "moderate" },
      generationmix: [{ fuel: "wind", perc: 40 }],
    },
  ],
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
  it("looks up a region by id", async () => {
    const calls = mockFetch(() => ({ data: [region(13, "London")] }));
    const body = await queryNeso("13");
    expect(calls[0]).toContain("/regional/regionid/13");
    expect(body.location.region.name).toBe("London");
    expect(body.attribution).toHaveLength(1);
  });

  it("cuts a full postcode to its outward code", async () => {
    const calls = mockFetch(() => ({ data: [region(13, "London")] }));
    await queryNeso("sw1a 1aa");
    expect(calls[0]).toContain("/regional/postcode/SW1A");
  });

  it("finds a region by name", async () => {
    // The all-regions endpoint groups by period, with intensity on each region entry.
    const { data, ...rest } = region(13, "London");
    const [period] = data;
    mockFetch(() => ({
      data: [{ from: "a", to: "b", regions: [{ ...rest, ...period }] }],
    }));
    const body = await queryNeso("london");
    expect(body.location.region.id).toBe(13);
  });

  it("adds the best window from the 48h series when asked", async () => {
    const period = (from: string, forecast: number) => ({
      from,
      to: from,
      intensity: { forecast, index: "moderate" },
      generationmix: [],
    });
    const { data, ...rest } = region(13, "London");
    const calls = mockFetch(() => ({
      data: {
        ...rest,
        data: [period("a", 200), period("b", 100), period("c", 50), period("d", 300)],
      },
    }));
    const body = await queryNeso("13", { windowMinutes: 60 });
    expect(calls[0]).toContain("fw48h");
    expect(body.forecast).toBeUndefined();
    expect(body.surplus?.derived.suggested?.window).toMatchObject({ from: "b", averageIntensity: 75 });
    expect(data).toBeDefined();
  });

  it("rejects out-of-range ids", async () => {
    await expect(queryNeso("15")).rejects.toBeInstanceOf(BadLocationError);
  });
});
