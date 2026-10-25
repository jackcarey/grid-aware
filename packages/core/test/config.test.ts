import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "../src/config.js";

describe("parseAllowedOrigins", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseAllowedOrigins("https://a.com, https://b.com ,,")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("returns an empty list for undefined", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});
