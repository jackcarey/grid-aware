import { describe, expect, it } from "vitest";
import { bmrsAttribution } from "../src/attribution.js";
import {
  bestDay,
  bestWindow,
  earliestWindowWithin,
  deriveSurplusDays,
  normalizeBmrsSurplus,
  normalizeElectricityMapsForecast,
  normalizeElectricityMapsLatest,
  normalizeNesoNational,
  normalizeNesoRegional,
  renewablePercentage,
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

describe("normalizeBmrsSurplus", () => {
  it("maps each day's surplus", () => {
    const result = normalizeBmrsSurplus([
      { forecastDate: "2026-10-19", publishTime: "2026-10-17T10:15:00Z", surplus: 6398 },
      { forecastDate: "2026-10-20", publishTime: "2026-10-17T10:15:00Z", surplus: 8148 },
    ]);
    expect(result).toEqual({
      unit: "MW",
      publishTime: "2026-10-17T10:15:00Z",
      forecast: [
        { date: "2026-10-19", surplus: 6398 },
        { date: "2026-10-20", surplus: 8148 },
      ],
    });
  });

  it("credits Elexon for the year the forecast was published", () => {
    expect(bmrsAttribution("2027-01-01T10:15:00Z").text).toBe(
      "Contains BMRS data © Elexon Limited copyright and database right 2027",
    );
  });

  it("returns undefined when there's no usable surplus data", () => {
    expect(normalizeBmrsSurplus([])).toBeUndefined();
  });
});

describe("deriveSurplusDays", () => {
  const bmrs = {
    unit: "MW" as const,
    publishTime: "2026-10-17T10:15:00Z",
    forecast: [
      { date: "2026-10-19", surplus: 6000 },
      { date: "2026-10-20", surplus: 9000 },
      { date: "2026-10-21", surplus: 12000 },
    ],
  };
  const demand = (forecastDate: string, nationalDemand: number) => ({ forecastDate, nationalDemand });

  it("gives each day's share of national demand and ranks days by it", () => {
    expect(
      deriveSurplusDays(bmrs, [demand("2026-10-19", 30000), demand("2026-10-20", 36000)]),
    ).toEqual([
      { date: "2026-10-19", percentageOfDemand: 20, dayRank: 2 },
      { date: "2026-10-20", percentageOfDemand: 25, dayRank: 1 },
      { date: "2026-10-21", dayRank: 3 },
    ]);
  });

  it("ranks by raw MW when there's no demand forecast, then by the soonest date", () => {
    const flat = { ...bmrs, forecast: [{ date: "2026-10-20", surplus: 5 }, { date: "2026-10-19", surplus: 5 }] };
    expect(deriveSurplusDays(flat, []).map((d) => d.dayRank)).toEqual([2, 1]);
    expect(deriveSurplusDays(bmrs, []).map((d) => d.dayRank)).toEqual([3, 2, 1]);
  });

  it("treats wind within 5 points of the windiest remaining day as level", () => {
    const days = {
      ...bmrs,
      forecast: [
        { date: "2026-10-23", surplus: 15000 },
        { date: "2026-10-24", surplus: 15180 },
        { date: "2026-10-25", surplus: 14430 },
        { date: "2026-10-26", surplus: 10920 },
        { date: "2026-10-27", surplus: 16000 },
      ],
    };
    const wind = [
      { date: "2026-10-23", windPercentageOfCapacity: 64.6 },
      { date: "2026-10-24", windPercentageOfCapacity: 62.6 },
      { date: "2026-10-25", windPercentageOfCapacity: 65 },
      { date: "2026-10-26", windPercentageOfCapacity: 62.7 },
      // Most slack, but well below the windiest group.
      { date: "2026-10-27", windPercentageOfCapacity: 55.7 },
    ];
    const demands = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"].map((d) =>
      demand(d, 30000),
    );
    expect(deriveSurplusDays(days, demands, wind).map((d) => [d.date, d.dayRank])).toEqual([
      ["2026-10-23", 2],
      ["2026-10-24", 1],
      ["2026-10-25", 3],
      ["2026-10-26", 4],
      ["2026-10-27", 5],
    ]);
  });

  it("ranks the windiest day with a positive surplus first, then share of demand", () => {
    const days = {
      ...bmrs,
      forecast: [
        { date: "2026-10-19", surplus: 9000 },
        { date: "2026-10-20", surplus: 3000 },
        { date: "2026-10-21", surplus: -500 },
        { date: "2026-10-22", surplus: 6000 },
      ],
    };
    const wind = [
      { date: "2026-10-19", windPercentageOfCapacity: 30 },
      { date: "2026-10-20", windPercentageOfCapacity: 60 },
      // Windiest, but there's no spare capacity, so it ranks last.
      { date: "2026-10-21", windPercentageOfCapacity: 80 },
      { date: "2026-10-22", windPercentageOfCapacity: 60 },
    ];
    const demands = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"].map((d) => demand(d, 30000));
    expect(deriveSurplusDays(days, demands, wind).map((d) => [d.date, d.dayRank])).toEqual([
      ["2026-10-19", 3],
      ["2026-10-20", 2],
      ["2026-10-21", 4],
      ["2026-10-22", 1],
    ]);
    expect(deriveSurplusDays(days, demands, wind)[1]).toEqual({
      date: "2026-10-20",
      percentageOfDemand: 10,
      windPercentageOfCapacity: 60,
      dayRank: 2,
    });
  });
});

describe("renewablePercentage", () => {
  it("sums wind, solar and hydro only", () => {
    expect(
      renewablePercentage([
        { fuel: "wind", percentage: 40.2 },
        { fuel: "solar", percentage: 10.1 },
        { fuel: "hydro", percentage: 2 },
        { fuel: "gas", percentage: 30 },
        { fuel: "nuclear", percentage: 17.7 },
      ]),
    ).toBe(52.3);
  });
});

describe("bestWindow", () => {
  const point = (hh: string, value: number | null) => ({
    datetime: `2026-01-01T${hh}:00Z`,
    validTo: `2026-01-01T${hh}:30Z`,
    value,
    type: "forecast" as const,
    band: "low" as const,
  });

  it("picks the earliest of equally clean windows", () => {
    expect(bestWindow([point("00", 50), point("01", 20), point("02", 20)], 30)?.from).toBe("2026-01-01T01:00Z");
  });

  it("rounds the duration up to whole half-hours and skips runs with gaps", () => {
    const window = bestWindow([point("00", 10), point("01", null), point("02", 40), point("03", 60)], 45);
    expect(window).toEqual({
      from: "2026-01-01T02:00Z",
      to: "2026-01-01T03:30Z",
      averageIntensity: 50,
      unit: "gCO2eq/kWh",
    });
  });

  it("returns undefined when the job is longer than the forecast", () => {
    expect(bestWindow([point("00", 10)], 60)).toBeUndefined();
  });

  describe("with hourly points that have no validTo", () => {
    const hourly = (hh: string, value: number) => ({
      datetime: `2026-01-01T${hh}:00:00.000Z`,
      value,
      type: "forecast" as const,
      band: "low" as const,
    });
    const points = [hourly("00", 100), hourly("01", 50), hourly("02", 200)];

    it("takes the period from the gap between points and ends the window after the last one", () => {
      expect(bestWindow(points, 60)).toEqual({
        from: "2026-01-01T01:00:00.000Z",
        to: "2026-01-01T02:00:00.000Z",
        averageIntensity: 50,
        unit: "gCO2eq/kWh",
      });
    });

    it("rounds the job up to whole hours", () => {
      expect(bestWindow(points, 90)?.to).toBe("2026-01-01T02:00:00.000Z");
      expect(bestWindow(points, 90)?.averageIntensity).toBe(75);
    });
  });

  it("only considers runs that start by startBefore", () => {
    const points = [point("00", 90), point("01", 40), point("02", 10)];
    expect(bestWindow(points, 30)?.from).toBe("2026-01-01T02:00Z");
    expect(bestWindow(points, 30, { startBefore: new Date("2026-01-01T01:30:00Z") })?.from).toBe("2026-01-01T01:00Z");
  });

  it("skips periods that ended before startAfter, but not the one under way", () => {
    const points = [point("00", 10), point("01", 40), point("02", 90)];
    expect(bestWindow(points, 30, { startAfter: new Date("2026-01-01T00:45:00Z") })?.from).toBe("2026-01-01T01:00Z");
    expect(bestWindow(points, 30, { startAfter: new Date("2026-01-01T00:15:00Z") })?.from).toBe("2026-01-01T00:00Z");
  });
});

describe("earliestWindowWithin", () => {
  const point = (hh: string, value: number, band: "low" | "moderate" | "high" | "very-high" | "unknown") => ({
    datetime: `2026-01-01T${hh}:00Z`,
    validTo: `2026-01-01T${hh}:30Z`,
    value,
    type: "forecast" as const,
    band,
  });
  const points = [point("00", 300, "high"), point("01", 150, "moderate"), point("02", 40, "low"), point("03", 160, "moderate")];

  it("returns the earliest window at or below the band, not the cleanest", () => {
    expect(earliestWindowWithin(points, 30, "moderate")?.from).toBe("2026-01-01T01:00Z");
    expect(bestWindow(points, 30)?.from).toBe("2026-01-01T02:00Z");
  });

  it("needs every period of the job to qualify", () => {
    // 00 is high, so a two-period job at 01 + 02 is the first run that is all moderate or better.
    expect(earliestWindowWithin(points, 60, "moderate")?.from).toBe("2026-01-01T01:00Z");
    expect(earliestWindowWithin([point("00", 150, "moderate"), point("01", 300, "high"), point("02", 40, "low")], 60, "moderate")).toBeUndefined();
  });

  it("is undefined when no run qualifies, and never accepts an unknown band", () => {
    expect(earliestWindowWithin(points, 30, "low")?.from).toBe("2026-01-01T02:00Z");
    expect(earliestWindowWithin([point("00", 300, "high")], 30, "moderate")).toBeUndefined();
    expect(earliestWindowWithin([point("00", 40, "unknown")], 30, "high")).toBeUndefined();
  });

  it("respects the start bounds", () => {
    expect(earliestWindowWithin(points, 30, "moderate", { startAfter: new Date("2026-01-01T01:45:00Z") })?.from).toBe("2026-01-01T02:00Z");
    expect(earliestWindowWithin(points, 30, "low", { startBefore: new Date("2026-01-01T01:30:00Z") })).toBeUndefined();
  });
});

describe("bestDay", () => {
  const bmrs = {
    unit: "MW" as const,
    publishTime: "2026-10-17T10:15:00Z",
    forecast: [
      { date: "2026-10-19", surplus: 6000 },
      { date: "2026-10-20", surplus: 9000 },
    ],
  };

  it("picks the top-ranked day", () => {
    const days = [
      { date: "2026-10-19", percentageOfDemand: 30, dayRank: 1 },
      { date: "2026-10-20", percentageOfDemand: 20, dayRank: 2 },
    ];
    expect(bestDay(bmrs, days)).toEqual({ date: "2026-10-19", surplus: 6000, percentageOfDemand: 30 });
  });

  it("returns the day ranked 1, whatever order the days arrive in", () => {
    const days = [
      { date: "2026-10-20", dayRank: 1 },
      { date: "2026-10-19", dayRank: 2 },
    ];
    expect(bestDay(bmrs, days)).toEqual({ date: "2026-10-20", surplus: 9000 });
  });
});
