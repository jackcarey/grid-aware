import { describe, expect, it } from "vitest";
import { resolveIntensityTarget } from "../src/routes/intensity.js";
import { ApiError } from "../src/errors.js";

describe("resolveIntensityTarget (auto)", () => {
  it("routes zone=GB from the UK to NESO national", () => {
    const target = resolveIntensityTarget({ zone: "GB", source: "auto", isUk: true });
    expect(target).toEqual({ kind: "neso-national" });
  });

  it("routes zone=GB from outside the UK to Electricity Maps with a fallback reason", () => {
    const target = resolveIntensityTarget({ zone: "GB", source: "auto", isUk: false });
    expect(target.kind).toBe("electricitymaps");
    if (target.kind === "electricitymaps") {
      expect(target.zone).toBe("GB");
      expect(target.fallbackReason).toMatch(/UK-origin/);
    }
  });

  it("routes a postcode from the UK to NESO regional", () => {
    const target = resolveIntensityTarget({ postcode: "SW1A", source: "auto", isUk: true });
    expect(target).toEqual({ kind: "neso-regional", postcode: "SW1A", regionId: undefined });
  });

  it("rejects a postcode from outside the UK", () => {
    expect(() =>
      resolveIntensityTarget({ postcode: "SW1A", source: "auto", isUk: false }),
    ).toThrow(ApiError);
    try {
      resolveIntensityTarget({ postcode: "SW1A", source: "auto", isUk: false });
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
    }
  });

  it("rejects a regionid from outside the UK", () => {
    expect(() => resolveIntensityTarget({ regionId: 3, source: "auto", isUk: false })).toThrow(
      ApiError,
    );
  });

  it("routes a non-GB zone to Electricity Maps regardless of origin", () => {
    expect(resolveIntensityTarget({ zone: "FR", source: "auto", isUk: false })).toEqual({
      kind: "electricitymaps",
      zone: "FR",
    });
    expect(resolveIntensityTarget({ zone: "FR", source: "auto", isUk: true })).toEqual({
      kind: "electricitymaps",
      zone: "FR",
    });
  });

  it("requires a subject", () => {
    expect(() => resolveIntensityTarget({ source: "auto", isUk: true })).toThrow(ApiError);
  });
});

describe("resolveIntensityTarget (explicit source=neso)", () => {
  it("always rejects non-UK callers, regardless of subject", () => {
    expect(() =>
      resolveIntensityTarget({ zone: "GB", source: "neso", isUk: false }),
    ).toThrow(ApiError);
    try {
      resolveIntensityTarget({ postcode: "SW1A", source: "neso", isUk: false });
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
    }
  });

  it("allows UK callers for GB/regional subjects", () => {
    expect(resolveIntensityTarget({ zone: "GB", source: "neso", isUk: true })).toEqual({
      kind: "neso-national",
    });
    expect(resolveIntensityTarget({ regionId: 3, source: "neso", isUk: true })).toEqual({
      kind: "neso-regional",
      postcode: undefined,
      regionId: 3,
    });
  });

  it("rejects a non-GB zone even for UK callers", () => {
    expect(() => resolveIntensityTarget({ zone: "FR", source: "neso", isUk: true })).toThrow(
      /Great Britain/,
    );
  });
});

describe("resolveIntensityTarget (explicit source=electricitymaps)", () => {
  it("uses Electricity Maps for zone=GB even from the UK (no UK-gate applies)", () => {
    expect(
      resolveIntensityTarget({ zone: "GB", source: "electricitymaps", isUk: true }),
    ).toEqual({ kind: "electricitymaps", zone: "GB" });
  });

  it("rejects a regional-only subject", () => {
    expect(() =>
      resolveIntensityTarget({ postcode: "SW1A", source: "electricitymaps", isUk: true }),
    ).toThrow(/no equivalent/);
  });

  it("requires a zone", () => {
    expect(() =>
      resolveIntensityTarget({ source: "electricitymaps", isUk: true }),
    ).toThrow(ApiError);
  });
});
