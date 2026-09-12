import { describe, expect, it } from "vitest";
import { bandFromNesoIndex, bandFromValue } from "../src/bands.js";

describe("bandFromNesoIndex", () => {
  it.each([
    ["very low", "low"],
    ["low", "low"],
    ["moderate", "moderate"],
    ["high", "high"],
    ["very high", "very-high"],
    ["Very High", "very-high"],
  ] as const)("maps %s -> %s", (index, expected) => {
    expect(bandFromNesoIndex(index)).toBe(expected);
  });

  it("returns unknown for an unrecognized index", () => {
    expect(bandFromNesoIndex("extreme")).toBe("unknown");
  });
});

describe("bandFromValue", () => {
  it("buckets using the default thresholds", () => {
    expect(bandFromValue(10)).toBe("low");
    expect(bandFromValue(150)).toBe("moderate");
    expect(bandFromValue(350)).toBe("high");
    expect(bandFromValue(600)).toBe("very-high");
  });

  it("respects custom thresholds", () => {
    expect(bandFromValue(50, { moderate: 10, high: 20, veryHigh: 30 })).toBe("very-high");
  });
});
