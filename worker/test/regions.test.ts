import { describe, expect, it } from "vitest";
import { cityForColo, nationFromRegionName, regionIdForCity, regionInfoFromNation } from "../src/regions.js";

describe("regionIdForCity", () => {
  it("maps a known city case-insensitively", () => {
    expect(regionIdForCity("London")).toBe(13);
    expect(regionIdForCity("BIRMINGHAM")).toBe(8);
    expect(regionIdForCity("  edinburgh  ")).toBe(2);
  });

  it("returns undefined for an unknown or missing city", () => {
    expect(regionIdForCity("Nowheresville")).toBeUndefined();
    expect(regionIdForCity(undefined)).toBeUndefined();
  });
});

describe("nationFromRegionName", () => {
  it("accepts an exact GB nation name", () => {
    expect(nationFromRegionName("Scotland")).toBe("Scotland");
  });

  it("rejects anything else", () => {
    expect(nationFromRegionName("Yorkshire")).toBeUndefined();
    expect(nationFromRegionName(undefined)).toBeUndefined();
  });
});

describe("cityForColo", () => {
  it("maps a known GB colo case-insensitively", () => {
    expect(cityForColo("LHR")).toBe("London");
    expect(cityForColo("edi")).toBe("Edinburgh");
  });

  it("returns undefined for an unknown or missing colo", () => {
    expect(cityForColo("DFW")).toBeUndefined();
    expect(cityForColo(undefined)).toBeUndefined();
  });

  it("resolves through regionIdForCity to the correct DNO region", () => {
    expect(regionIdForCity(cityForColo("MAN"))).toBe(3);
  });
});

describe("regionInfoFromNation", () => {
  it("marks unknown false when a nation is given", () => {
    expect(regionInfoFromNation("Wales")).toEqual({ nation: "Wales", unknown: false });
  });

  it("marks unknown true when no nation is known", () => {
    expect(regionInfoFromNation(undefined)).toEqual({ unknown: true });
  });
});
