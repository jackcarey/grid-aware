import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "../../src/errors.js";
import { getDailyDemand, getDailySurplus } from "../../src/providers/bmrs.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bmrs provider", () => {
  it("hits the daily surplus and demand forecast endpoints", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getDailySurplus();
    await getDailyDemand();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://data.elexon.co.uk/bmrs/api/v1/forecast/surplus/daily?format=json",
    );
    expect(fetchMock.mock.calls[1]![0]).toBe(
      "https://data.elexon.co.uk/bmrs/api/v1/forecast/demand/daily?format=json",
    );
  });

  it("throws UpstreamError on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(getDailySurplus()).rejects.toThrow(UpstreamError);
  });

  it("throws UpstreamError when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    await expect(getDailyDemand()).rejects.toThrow(UpstreamError);
  });
});
