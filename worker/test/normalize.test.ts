import { describe, expect, it } from "vitest";
import {
  normalizeElectricityMapsForecast,
  normalizeElectricityMapsLatest,
  normalizeNesoNational,
  normalizeNesoRegional,
} from "../src/normalize.js";

describe("normalizeElectricityMapsLatest", () => {
  it("maps the raw shape and buckets a band", () => {
    const result = normalizeElectricityMapsLatest(
      { zone: "FR", carbonIntensity: 42, datetime: "2026-01-01T00:00:00.000Z" },
      { zone: "FR", region: { unknown: true } },
    );
    expect(result.source).toBe("electricitymaps");
    expect(result.location).toEqual({ zone: "FR", region: { unknown: true } });
    expect(result.carbonIntensity.value).toBe(42);
    expect(result.carbonIntensity.band).toBe("low");
    expect(result.forecast).toBeUndefined();
    expect(result.fallback).toBeUndefined();
  });

  it("attaches a fallback reason when provided", () => {
    const result = normalizeElectricityMapsLatest(
      { zone: "GB", carbonIntensity: 200, datetime: "2026-01-01T00:00:00.000Z" },
      { zone: "GB", region: { unknown: true } },
      "NESO restricted",
    );
    expect(result.fallback).toEqual({ reason: "NESO restricted" });
  });
});

describe("normalizeElectricityMapsForecast", () => {
  it("uses the first forecast entry for the top-level reading", () => {
    const result = normalizeElectricityMapsForecast(
      {
        zone: "FR",
        forecast: [
          { datetime: "2026-01-01T01:00:00.000Z", carbonIntensity: 500 },
          { datetime: "2026-01-01T02:00:00.000Z", carbonIntensity: 10 },
        ],
      },
      { zone: "FR", region: { unknown: true } },
    );
    expect(result.carbonIntensity.type).toBe("forecast");
    expect(result.carbonIntensity.band).toBe("very-high");
  });

  it("normalizes every entry into the forecast array, in order", () => {
    const result = normalizeElectricityMapsForecast(
      {
        zone: "FR",
        forecast: [
          { datetime: "2026-01-01T01:00:00.000Z", carbonIntensity: 500 },
          { datetime: "2026-01-01T02:00:00.000Z", carbonIntensity: 10 },
        ],
      },
      { zone: "FR", region: { unknown: true } },
    );
    expect(result.forecast).toEqual([
      { datetime: "2026-01-01T01:00:00.000Z", value: 500, type: "forecast", band: "very-high" },
      { datetime: "2026-01-01T02:00:00.000Z", value: 10, type: "forecast", band: "low" },
    ]);
  });

  it("throws when forecast is empty", () => {
    expect(() =>
      normalizeElectricityMapsForecast(
        { zone: "FR", forecast: [] },
        { zone: "FR", region: { unknown: true } },
      ),
    ).toThrow();
  });
});

describe("normalizeNesoNational", () => {
  it("prefers actual over forecast and passes through the index", () => {
    const result = normalizeNesoNational(
      [
        {
          from: "2026-01-01T00:00Z",
          to: "2026-01-01T00:30Z",
          intensity: { actual: 80, forecast: 90, index: "low" },
        },
      ],
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.source).toBe("neso");
    expect(result.carbonIntensity.value).toBe(80);
    expect(result.carbonIntensity.type).toBe("actual");
    expect(result.carbonIntensity.band).toBe("low");
  });

  it("falls back to forecast when actual is absent", () => {
    const result = normalizeNesoNational(
      [
        {
          from: "2026-01-01T00:00Z",
          to: "2026-01-01T00:30Z",
          intensity: { forecast: 90, index: "moderate" },
        },
      ],
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.carbonIntensity.value).toBe(90);
    expect(result.carbonIntensity.type).toBe("forecast");
  });

  it("omits the forecast array for a single (latest) period", () => {
    const result = normalizeNesoNational(
      [
        {
          from: "2026-01-01T00:00Z",
          to: "2026-01-01T00:30Z",
          intensity: { actual: 80, forecast: 90, index: "low" },
        },
      ],
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.forecast).toBeUndefined();
  });

  it("normalizes every period into the forecast array for a multi-period window", () => {
    const result = normalizeNesoNational(
      [
        {
          from: "2026-01-01T00:00Z",
          to: "2026-01-01T00:30Z",
          intensity: { forecast: 90, index: "moderate" },
        },
        {
          from: "2026-01-01T00:30Z",
          to: "2026-01-01T01:00Z",
          intensity: { forecast: 120, index: "high" },
        },
      ],
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.forecast).toEqual([
      { datetime: "2026-01-01T00:00Z", validTo: "2026-01-01T00:30Z", value: 90, type: "forecast", band: "moderate" },
      { datetime: "2026-01-01T00:30Z", validTo: "2026-01-01T01:00Z", value: 120, type: "forecast", band: "high" },
    ]);
  });

  it("throws when the period list is empty", () => {
    expect(() => normalizeNesoNational([], { zone: "GB", region: { unknown: true } })).toThrow();
  });
});

describe("normalizeNesoRegional", () => {
  it("includes region info and generation mix from the first period", () => {
    const result = normalizeNesoRegional(
      {
        regionid: 13,
        dnoregion: "London",
        shortname: "London",
        data: [
          {
            from: "2026-01-01T00:00Z",
            to: "2026-01-01T00:30Z",
            intensity: { forecast: 120, index: "moderate" },
            generationmix: [{ fuel: "wind", perc: 30 }],
          },
        ],
      },
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.location).toEqual({
      zone: "GB",
      region: { id: 13, name: "London", unknown: false },
    });
    expect(result.generationMix).toEqual([{ fuel: "wind", percentage: 30 }]);
    expect(result.forecast).toBeUndefined();
  });

  it("normalizes every period into the forecast array, each with its own generation mix", () => {
    const result = normalizeNesoRegional(
      {
        regionid: 13,
        dnoregion: "London",
        shortname: "London",
        data: [
          {
            from: "2026-01-01T00:00Z",
            to: "2026-01-01T00:30Z",
            intensity: { forecast: 120, index: "moderate" },
            generationmix: [{ fuel: "wind", perc: 30 }],
          },
          {
            from: "2026-01-01T00:30Z",
            to: "2026-01-01T01:00Z",
            intensity: { forecast: 200, index: "high" },
            generationmix: [{ fuel: "gas", perc: 40 }],
          },
        ],
      },
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.forecast).toEqual([
      {
        datetime: "2026-01-01T00:00Z",
        validTo: "2026-01-01T00:30Z",
        value: 120,
        type: "forecast",
        band: "moderate",
        generationMix: [{ fuel: "wind", percentage: 30 }],
      },
      {
        datetime: "2026-01-01T00:30Z",
        validTo: "2026-01-01T01:00Z",
        value: 200,
        type: "forecast",
        band: "high",
        generationMix: [{ fuel: "gas", percentage: 40 }],
      },
    ]);
  });

  it("throws when the region has no periods", () => {
    expect(() =>
      normalizeNesoRegional(
        { regionid: 13, dnoregion: "London", shortname: "London", data: [] },
        { zone: "GB", region: { unknown: true } },
      ),
    ).toThrow();
  });
});
