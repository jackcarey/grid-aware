import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "../../src/errors.js";
import { getDailyWind } from "../../src/providers/nesoDataPortal.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const reply = (records: unknown[]) => new Response(JSON.stringify({ result: { records } }), { status: 200 });

describe("nesoDataPortal provider", () => {
  it("averages wind per day as a share of capacity, skipping part-days", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      reply([
        { date: "2026-10-17", mw: "9095.92", capacity: "25502", periods: "25" },
        { date: "2026-10-18", mw: "8509.4375", capacity: "25502", periods: "48" },
        { date: "2026-10-25", mw: "16576", capacity: "25502", periods: "50" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await getDailyWind()).toEqual([
      { date: "2026-10-18", windPercentageOfCapacity: 33.4 },
      { date: "2026-10-25", windPercentageOfCapacity: 65 },
    ]);
    expect(fetchMock.mock.calls[0]![0]).toMatch(
      /^https:\/\/api\.neso\.energy\/api\/3\/action\/datastore_search_sql\?sql=/,
    );
  });

  it("throws UpstreamError on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    await expect(getDailyWind()).rejects.toThrow(UpstreamError);
  });
});
