import { MAX_WINDOW_MINUTES, parseArgs } from "./args.js";
import type { Config } from "./config.js";
import { BadLocationError, type NesoOptions } from "./neso.js";
import { appendNesoRow, type ExecResult, INSTALL_HINT } from "./passthrough.js";

const NESO_URL = "carbonintensity.org.uk";

export interface Deps {
  env: Record<string, string | undefined>;
  readConfig(): Config;
  exec(args: readonly string[], capture: boolean): Promise<ExecResult>;
  queryNeso(location: string, options?: NesoOptions): Promise<unknown>;
  stdout(text: string): void;
  stderr(text: string): void;
}

/** Runs the CLI and returns the exit code. NESO queries are answered here; everything else goes to grid-intensity untouched. */
export async function run(argv: readonly string[], deps: Deps): Promise<number> {
  const parsed = parseArgs(argv);
  const config = deps.readConfig();
  const provider = parsed.provider ?? deps.env.GRID_INTENSITY_PROVIDER ?? config.provider;
  const location = parsed.location ?? deps.env.GRID_INTENSITY_LOCATION ?? config.location;
  const isNeso = provider?.toLowerCase() === "neso";
  const [command, sub] = parsed.positionals;

  if (command === "provider" && sub === "list") {
    const result = await deps.exec(argv, true);
    if (result.missing) return fail(deps, INSTALL_HINT, 127);
    deps.stderr(result.stderr);
    deps.stdout(result.status === 0 ? appendNesoRow(result.stdout, NESO_URL) : result.stdout);
    return result.status;
  }

  if (isNeso && command === "exporter") {
    return fail(deps, "The exporter doesn't support the NESO provider yet.", 2);
  }

  if (isNeso && command === undefined && !parsed.help) {
    if (!location) return fail(deps, "--location is required for NESO: GB, a region id (1-14), a region name or a postcode.", 2);
    const { window } = parsed;
    if (window !== undefined && !(Number.isInteger(window) && window >= 1 && window <= MAX_WINDOW_MINUTES)) {
      return fail(deps, `--window must be a whole number of minutes from 1 to ${MAX_WINDOW_MINUTES}.`, 2);
    }
    try {
      deps.stdout(`${JSON.stringify(await deps.queryNeso(location, { windowMinutes: window }), null, 2)}\n`);
      return 0;
    } catch (error) {
      return fail(deps, error instanceof Error ? error.message : String(error), error instanceof BadLocationError ? 2 : 1);
    }
  }

  const result = await deps.exec(argv, false);
  return result.missing ? fail(deps, INSTALL_HINT, 127) : result.status;
}

function fail(deps: Deps, message: string, code: number): number {
  deps.stderr(`${message}\n`);
  return code;
}
