import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "../src/args.js";
import { parseConfig } from "../src/config.js";
import { assetName, resolveBinary, verifyChecksum } from "../src/gwf.js";
import { appendNesoRow, type Deps, run } from "../src/main.js";

const OK = { status: 0, stdout: "", stderr: "" };

function makeDeps(overrides: Partial<Deps> = {}) {
  const out: string[] = [];
  const deps: Deps = {
    env: {},
    readConfig: () => ({}),
    exec: vi.fn(async () => OK),
    queryNeso: vi.fn(async () => ({ source: "neso" })),
    stdout: (t) => out.push(t),
    stderr: () => {},
    ...overrides,
  };
  return { deps, out };
}

/** Runs the CLI against fake dependencies and returns the exit code with what it called. */
async function runWith(argv: string[], overrides?: Partial<Deps>) {
  const { deps, out } = makeDeps(overrides);
  return { code: await run(argv, deps), deps, out };
}

describe("resolveBinary", () => {
  it("prefers GRID_INTENSITY_BIN, then the downloaded copy, then PATH", () => {
    expect(resolveBinary({ GRID_INTENSITY_BIN: "/x" }, "/cache/gi", () => true)).toBe("/x");
    expect(resolveBinary({}, "/cache/gi", () => true)).toBe("/cache/gi");
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

  it("rejects a download that doesn't match its checksum", () => {
    const data = Buffer.from("binary");
    const good = createHash("sha256").update(data).digest("hex");
    expect(() => verifyChecksum(data, "a.tar.gz", `${good}  a.tar.gz\n`)).not.toThrow();
    expect(() => verifyChecksum(data, "a.tar.gz", `${"0".repeat(64)}  a.tar.gz\n`)).toThrow(/mismatch/);
    expect(() => verifyChecksum(data, "b.tar.gz", `${good}  a.tar.gz\n`)).toThrow(/No checksum/);
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
    const table = appendNesoRow("NAME     URL\nEmber    ember-climate.org\n");
    expect(table.split("\n")[2]).toBe("NESO     carbonintensity.org.uk");
  });
});

describe("run", () => {
  it("answers NESO queries itself", async () => {
    const { code, deps, out } = await runWith(["--provider", "neso", "--location", "13"]);
    expect(code).toBe(0);
    expect(deps.queryNeso).toHaveBeenCalledWith("13", { windowMinutes: undefined });
    expect(deps.exec).not.toHaveBeenCalled();
    expect(JSON.parse(out.join(""))).toEqual({ source: "neso" });
  });

  it("takes the provider and location from config", async () => {
    const { deps } = await runWith([], { readConfig: () => ({ provider: "NESO", location: "SW1A" }) });
    expect(deps.queryNeso).toHaveBeenCalledWith("SW1A", { windowMinutes: undefined });
  });

  it("passes other providers through with argv untouched", async () => {
    const exec = vi.fn(async () => ({ ...OK, status: 3 }));
    const { code } = await runWith(["--location", "PT", "--future-flag"], { exec });
    expect(code).toBe(3);
    expect(exec).toHaveBeenCalledWith(["--location", "PT", "--future-flag"], false);
  });

  it("passes exporter through for other providers but rejects it for NESO", async () => {
    const other = await runWith(["exporter", "--location", "PT"]);
    expect(other.deps.exec).toHaveBeenCalled();
    expect((await runWith(["exporter", "--provider", "NESO", "--location", "1"])).code).toBe(2);
  });

  it("adds NESO to provider list", async () => {
    const exec = vi.fn(async () => ({ ...OK, stdout: "NAME  URL\nEmber  x\n" }));
    const { code, out } = await runWith(["provider", "list"], { exec });
    expect(code).toBe(0);
    expect(out.join("")).toContain("NESO");
  });

  it("passes --window through, defaulting a bare flag to 30 minutes", async () => {
    const withValue = await runWith(["--provider", "NESO", "--location", "13", "--window", "90"]);
    expect(withValue.deps.queryNeso).toHaveBeenCalledWith("13", { windowMinutes: 90 });
    const bare = await runWith(["--provider", "NESO", "--location", "13", "--window"]);
    expect(bare.deps.queryNeso).toHaveBeenCalledWith("13", { windowMinutes: 30 });
  });

  it("rejects a bad --window", async () => {
    for (const value of ["0", "2881", "abc"]) {
      const { code, deps } = await runWith(["--provider", "NESO", "--location", "13", `--window=${value}`]);
      expect(code).toBe(2);
      expect(deps.queryNeso).not.toHaveBeenCalled();
    }
  });

  it("requires a location for NESO", async () => {
    expect((await runWith(["--provider", "NESO"])).code).toBe(2);
  });
});
