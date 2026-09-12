import { describe, expect, it } from "vitest";
import { isUkRequest, toOutwardPostcode } from "../src/geo.js";

describe("isUkRequest", () => {
  it("is true for GB", () => {
    expect(isUkRequest("GB")).toBe(true);
  });

  it("is false for other countries", () => {
    expect(isUkRequest("FR")).toBe(false);
    expect(isUkRequest("US")).toBe(false);
  });

  it("is false when undefined (e.g. local dev with no cf object)", () => {
    expect(isUkRequest(undefined)).toBe(false);
  });
});

describe("toOutwardPostcode", () => {
  it("extracts the outward code from a full postcode with a space", () => {
    expect(toOutwardPostcode("SW1A 1AA")).toBe("SW1A");
  });

  it("extracts the outward code from a full postcode with no space", () => {
    expect(toOutwardPostcode("sw1a1aa")).toBe("SW1A");
  });

  it("accepts an already-outward code as-is", () => {
    expect(toOutwardPostcode("RG41")).toBe("RG41");
  });

  it("is undefined for a non-UK postal code", () => {
    expect(toOutwardPostcode("78701")).toBeUndefined();
  });
});
