import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assetName, cacheDir, cachedBinary, verifyChecksum } from "../src/gwf.js";
import { parseArgs } from "../src/args.js";
import { parseConfig } from "../src/config.js";
import { type Deps, run } from "../src/main.js";
import { appendNesoRow, resolveBinary } from "../src/passthrough.js";

function makeDeps(overrides: Partial<Deps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: Deps = {
    env: {},
    readConfig: () => ({}),
    exec: vi.fn(async () => ({ status: 0, stdout: "", stderr: "", missing: false })),
    queryNeso: vi.fn(async () => ({ source: "neso" })),
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    ...overrides,
  };
  return { deps, out, err };
}

describe("resolveBinary", () => {
  it("prefers GRID_INTENSITY_BIN", () => {
    expect(resolveBinary({ GRID_INTENSITY_BIN: "/x" }, "/cache/gi", () => true)).toBe("/x");
  });

  it("uses the downloaded copy when it exists", () => {
    expect(resolveBinary({}, "/cache/gi", () => true)).toBe("/cache/gi");
  });

  it("falls back to PATH", () => {
    expect(resolveBinary({}, "/cache/gi", () => false)).toBe("grid-intensity");
  });
});

describe("gwf downloads", () => {
  it("maps platforms to upstream assets", () => {
    expect(assetName("linux", "x64")).toBe("grid-intensity_Linux_x86_64.tar.gz");
    expect(assetName("darwin", "arm64")).toBe("grid-intensity_Darwin_arm64.tar.gz");
    expect(assetName("win32", "x64")).toBe("grid-intensity_Windows_x86_64.zip");
    expect(assetName("freebsd", "x64")).toBeUndefined();
  });

  it("caches per version under the platform cache dir", () => {
    expect(cacheDir({ XDG_CACHE_HOME: "/c" }, "linux")).toMatch(/grid-intensity-\d+\.\d+\.\d+$/);
    expect(cachedBinary({ XDG_CACHE_HOME: "/c" }, "win32")).toMatch(/grid-intensity\.exe$/);
  });

  it("rejects a download that doesn't match its checksum", () => {
    const data = Buffer.from("binary");
    const good = createHash("sha256").update(data).digest("hex");
    expect(() => verifyChecksum(data, "a.tar.gz", `${good}  a.tar.gz
`)).not.toThrow();
    expect(() => verifyChecksum(data, "a.tar.gz", `${"0".repeat(64)}  a.tar.gz
`)).toThrow(/mismatch/);
    expect(() => verifyChecksum(data, "b.tar.gz", `${good}  a.tar.gz
`)).toThrow(/No checksum/);
  });
});

describe("parseArgs", () => {
  it("reads flags in both forms and leaves the rest as positionals", () => {
    expect(parseArgs(["--provider=NESO", "--location", "13", "exporter"])).toEqual({
      positionals: ["exporter"],
      provider: "NESO",
      location: "13",
      help: false,
    });
  });
});

describe("parseConfig", () => {
  it("reads flat provider and location lines", () => {
    expect(parseConfig('provider: "Ember" # default\nlocation: PT\nother: x\n')).toEqual({
      provider: "Ember",
      location: "PT",
    });
  });
});

describe("appendNesoRow", () => {
  it("lines the row up under the URL column", () => {
    const table = appendNesoRow("NAME     URL\nEmber    ember-climate.org\n", "carbonintensity.org.uk");
    expect(table.split("\n")[2]).toBe("NESO     carbonintensity.org.uk");
  });
});

describe("run", () => {
  it("answers NESO queries itself", async () => {
    const { deps, out } = makeDeps();
    expect(await run(["--provider", "neso", "--location", "13"], deps)).toBe(0);
    expect(deps.queryNeso).toHaveBeenCalledWith("13", { windowMinutes: undefined });
    expect(deps.exec).not.toHaveBeenCalled();
    expect(JSON.parse(out.join(""))).toEqual({ source: "neso" });
  });

  it("takes the provider from env, then config", async () => {
    const { deps } = makeDeps({ readConfig: () => ({ provider: "NESO", location: "SW1A" }) });
    await run([], deps);
    expect(deps.queryNeso).toHaveBeenCalledWith("SW1A", { windowMinutes: undefined });
  });

  it("passes other providers through with argv untouched", async () => {
    const exec = vi.fn(async () => ({ status: 3, stdout: "", stderr: "", missing: false }));
    const { deps } = makeDeps({ exec });
    expect(await run(["--location", "PT", "--future-flag"], deps)).toBe(3);
    expect(exec).toHaveBeenCalledWith(["--location", "PT", "--future-flag"], false);
  });

  it("passes exporter through for other providers but rejects it for NESO", async () => {
    const a = makeDeps();
    await run(["exporter", "--location", "PT"], a.deps);
    expect(a.deps.exec).toHaveBeenCalled();
    const b = makeDeps();
    expect(await run(["exporter", "--provider", "NESO", "--location", "1"], b.deps)).toBe(2);
  });

  it("adds NESO to provider list", async () => {
    const exec = vi.fn(async () => ({ status: 0, stdout: "NAME  URL\nEmber  x\n", stderr: "", missing: false }));
    const { deps, out } = makeDeps({ exec });
    expect(await run(["provider", "list"], deps)).toBe(0);
    expect(out.join("")).toContain("NESO");
  });

  it("passes --window through, defaulting a bare flag to 30 minutes", async () => {
    const a = makeDeps();
    await run(["--provider", "NESO", "--location", "13", "--window", "90"], a.deps);
    expect(a.deps.queryNeso).toHaveBeenCalledWith("13", { windowMinutes: 90 });
    const b = makeDeps();
    await run(["--provider", "NESO", "--location", "13", "--window"], b.deps);
    expect(b.deps.queryNeso).toHaveBeenCalledWith("13", { windowMinutes: 30 });
  });

  it("rejects a bad --window", async () => {
    for (const value of ["0", "2881", "abc"]) {
      const { deps } = makeDeps();
      expect(await run(["--provider", "NESO", "--location", "13", `--window=${value}`], deps)).toBe(2);
      expect(deps.queryNeso).not.toHaveBeenCalled();
    }
  });

  it("requires a location for NESO", async () => {
    const { deps } = makeDeps();
    expect(await run(["--provider", "NESO"], deps)).toBe(2);
  });

  it("explains a missing binary", async () => {
    const exec = vi.fn(async () => ({ status: 1, stdout: "", stderr: "", missing: true }));
    const { deps, err } = makeDeps({ exec });
    expect(await run(["--location", "PT"], deps)).toBe(127);
    expect(err.join("")).toContain("GRID_INTENSITY_BIN");
  });
});
