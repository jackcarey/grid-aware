import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cachedBinary } from "./gwf.js";

export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
  /** The binary couldn't be started, usually because it isn't installed. */
  missing: boolean;
}

export const INSTALL_HINT =
  "Couldn't get the grid-intensity binary. Check your connection, or point GRID_INTENSITY_BIN at one from https://github.com/thegreenwebfoundation/grid-intensity-go/releases.";

/** GRID_INTENSITY_BIN wins, then the downloaded copy, then whatever is on PATH. */
export function resolveBinary(
  env: Record<string, string | undefined> = process.env,
  cached: string = cachedBinary(),
  exists: (path: string) => boolean = existsSync,
): string {
  return env.GRID_INTENSITY_BIN || (exists(cached) ? cached : "grid-intensity");
}

/** Runs the real grid-intensity binary. With `capture` false it shares our terminal, so output and prompts pass straight through. */
export function execGridIntensity(
  args: readonly string[],
  capture: boolean,
  env: Record<string, string | undefined> = process.env,
): ExecResult {
  const result = spawnSync(resolveBinary(env), args, {
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    missing: result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT",
  };
}

/** Adds a NESO row to the `provider list` table, lined up under the URL column. */
export function appendNesoRow(table: string, url: string): string {
  const lines = table.replace(/\n+$/, "").split("\n");
  const urlColumn = lines[0]?.indexOf("URL") ?? -1;
  const name = "NESO";
  const row = urlColumn > name.length ? name.padEnd(urlColumn) + url : `${name}  ${url}`;
  return `${[...lines, row].join("\n")}\n`;
}
