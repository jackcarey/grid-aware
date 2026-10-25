import { NESO_ATTRIBUTION } from "../../../worker/src/attribution.js";
import { MAX_WINDOW_MINUTES, parseArgs } from "./args.js";
import type { Config } from "./config.js";
import type { ExecResult } from "./gwf.js";
import { BadLocationError, type NesoOptions } from "./neso.js";

/** Everything `run` reaches outside itself, so tests can fake it. */
export interface Deps {
  env: Record<string, string | undefined>;
  readConfig(): Config;
  exec(args: readonly string[], capture: boolean): Promise<ExecResult>;
  queryNeso(location: string, options?: NesoOptions): Promise<unknown>;
  stdout(text: string): void;
  stderr(text: string): void;
}

/** `grid-intensity` doesn't know about NESO, so its provider table is extended here. */
export function appendNesoRow(table: string): string {
  const lines = table.trimEnd().split("\n");
  const column = Math.max(lines[0]?.indexOf("URL") ?? 0, 6);
  return `${[...lines, `${"NESO".padEnd(column)}carbonintensity.org.uk`].join("\n")}\n`;
}

/** Anything not for NESO goes to `grid-intensity` with its arguments untouched, so new upstream flags keep working. */
export async function run(argv: readonly string[], deps: Deps): Promise<number> {
  const fail = (message: string, code: number) => {
    deps.stderr(`${message}\n`);
    return code;
  };
  const args = parseArgs(argv);
  const config = deps.readConfig();
  const provider = args.provider ?? deps.env.GRID_INTENSITY_PROVIDER ?? config.provider;
  const location = args.location ?? deps.env.GRID_INTENSITY_LOCATION ?? config.location;
  const isNeso = provider?.toLowerCase() === "neso";
  const [command, subcommand] = args.positionals;

  if (command === "provider" && subcommand === "list") {
    const { status, stdout, stderr } = await deps.exec(argv, true);
    deps.stderr(stderr);
    deps.stdout(status === 0 ? appendNesoRow(stdout) : stdout);
    return status;
  }

  if (!isNeso || args.help || (command !== undefined && command !== "exporter")) {
    return (await deps.exec(argv, false)).status;
  }
  if (command === "exporter") return fail("The exporter doesn't support the NESO provider yet.", 2);
  if (!location) return fail("--location is required for NESO: GB, a region id (1-14), a region name or a postcode.", 2);

  const { window } = args;
  if (window !== undefined && !(Number.isInteger(window) && window >= 1 && window <= MAX_WINDOW_MINUTES)) {
    return fail(`--window must be a whole number of minutes from 1 to ${MAX_WINDOW_MINUTES}.`, 2);
  }
  try {
    // Tab-indented like grid-intensity's own output.
    deps.stdout(`${JSON.stringify(await deps.queryNeso(location, { windowMinutes: window }), null, "\t")}\n`);
    // The CC BY licence requires the credit, and the output shape has nowhere to carry it.
    deps.stderr(`${NESO_ATTRIBUTION.text}\n`);
    return 0;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), error instanceof BadLocationError ? 2 : 1);
  }
}
