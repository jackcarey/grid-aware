import { afterEach, describe, expect, it, vi } from "vitest";
import { initGridAware, initGridAwareBlocking } from "../src/index.js";

describe("initGridAware", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-grid-aware");
  });

  it("sets data-grid-aware from the API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              source: "neso",
              location: { zone: "GB" },
              datetime: "2026-01-01T00:00:00.000Z",
              carbonIntensity: {
                value: 123,
                unit: "gCO2eq/kWh",
                type: "actual",
                band: "moderate",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const handle = initGridAware({ apiBaseUrl: "https://example.com" });
    await handle.refresh();

    expect(document.documentElement.dataset.gridAware).toBe("moderate");
    handle.stop();
  });

  it("applies a custom mapBand override", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              source: "electricitymaps",
              location: { zone: "FR" },
              datetime: "2026-01-01T00:00:00.000Z",
              carbonIntensity: {
                value: 42,
                unit: "gCO2eq/kWh",
                type: "estimated",
                band: "low",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const handle = initGridAware({
      apiBaseUrl: "https://example.com",
      mapBand: (data) => ((data.carbonIntensity.value ?? 0) > 40 ? "custom-high" : "custom-low"),
    });
    await handle.refresh();

    expect(document.documentElement.dataset.gridAware).toBe("custom-high");
    handle.stop();
  });

  it("throws when apiBaseUrl is missing", () => {
    expect(() => initGridAware({ apiBaseUrl: "" })).toThrow(/apiBaseUrl/);
  });

  it("never auto-refreshes when maxAgeMs is 0", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            source: "neso",
            location: { zone: "GB" },
            datetime: "2026-01-01T00:00:00.000Z",
            carbonIntensity: { value: 100, unit: "gCO2eq/kWh", type: "actual", band: "low" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const handle = initGridAware({ apiBaseUrl: "https://example.com", maxAgeMs: 0 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    handle.stop();
    vi.useRealTimers();
  });

  it("autoRefresh: false disables the timer even with a non-zero maxAgeMs", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            source: "neso",
            location: { zone: "GB" },
            datetime: "2026-01-01T00:00:00.000Z",
            carbonIntensity: { value: 100, unit: "gCO2eq/kWh", type: "actual", band: "low" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const handle = initGridAware({
      apiBaseUrl: "https://example.com",
      maxAgeMs: 60_000,
      autoRefresh: false,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.dataset.gridAware).toBe("low");

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    handle.stop();
    vi.useRealTimers();
  });

  it("serves cached data on refresh() within maxAgeMs instead of refetching", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            source: "neso",
            location: { zone: "GB" },
            datetime: "2026-01-01T00:00:00.000Z",
            carbonIntensity: { value: 100, unit: "gCO2eq/kWh", type: "actual", band: "low" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const handle = initGridAware({ apiBaseUrl: "https://example.com", maxAgeMs: 60_000 });
    // Wait for the effect of the initial fetch, not just the mock being invoked
    // the mock call count increments before `cached` is actually populated.
    await vi.waitFor(() => expect(document.documentElement.dataset.gridAware).toBe("low"));

    await handle.refresh();
    await handle.refresh();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("refetches once the cached data is older than maxAgeMs", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            source: "neso",
            location: { zone: "GB" },
            datetime: "2026-01-01T00:00:00.000Z",
            carbonIntensity: { value: 100, unit: "gCO2eq/kWh", type: "actual", band: "low" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const handle = initGridAware({ apiBaseUrl: "https://example.com", maxAgeMs: 60_000 });
    // Flush the initial refresh()'s microtasks without advancing the clock
    // vi.waitFor would nudge fake time forward by its own poll interval, which
    // then eats into the boundary check below.
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.dataset.gridAware).toBe("low");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    handle.stop();
    vi.useRealTimers();
  });
});

describe("initGridAwareBlocking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-grid-aware");
  });

  const okResponse = JSON.stringify({
    source: "neso",
    location: { zone: "GB", region: { unknown: true } },
    datetime: "2026-01-01T00:00:00.000Z",
    carbonIntensity: { value: 100, unit: "gCO2eq/kWh", type: "actual", band: "low" },
  });

  it("sets data-grid-aware synchronously, with no await needed", () => {
    class MockXHR {
      status = 200;
      responseText = okResponse;
      open() { }
      send() { }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    initGridAwareBlocking({ apiBaseUrl: "https://example.com" });

    expect(document.documentElement.dataset.gridAware).toBe("low");
  });

  it("builds the request URL from options, without a doubled slash", () => {
    let requestedUrl = "";
    class MockXHR {
      status = 200;
      responseText = okResponse;
      open(_method: string, url: string) {
        requestedUrl = url;
      }
      send() { }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    initGridAwareBlocking({ apiBaseUrl: "https://example.com/", zone: "FR", regionid: 13 });

    expect(requestedUrl).toBe("https://example.com/v1/intensity?zone=FR&regionid=13");
  });

  it("falls back to unknown when the request fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => { });
    class MockXHR {
      status = 500;
      responseText = "";
      open() { }
      send() { }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    initGridAwareBlocking({ apiBaseUrl: "https://example.com" });

    expect(document.documentElement.dataset.gridAware).toBe("unknown");
  });

  it("throws when apiBaseUrl is missing", () => {
    expect(() => initGridAwareBlocking({ apiBaseUrl: "" })).toThrow(/apiBaseUrl/);
  });
});
