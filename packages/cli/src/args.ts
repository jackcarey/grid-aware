export interface ParsedArgs {
  positionals: string[];
  provider?: string;
  location?: string;
  /** `--window` with no value means the default job length. NaN when the value isn't a number. */
  window?: number;
  help: boolean;
}

export const DEFAULT_WINDOW_MINUTES = 30;
export const MAX_WINDOW_MINUTES = 2880;

/** Reads just the parts of the grid-intensity command line that decide who handles it. Everything else is left for the real binary. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { positionals: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const [flag, inline] = arg.startsWith("--") ? splitFlag(arg) : [arg, undefined];
    if (flag === "--provider" || flag === "--location") {
      const value = inline ?? argv[++i];
      if (flag === "--provider") parsed.provider = value;
      else parsed.location = value;
    } else if (flag === "--window") {
      // The value is optional, so only a following number belongs to the flag.
      const next = argv[i + 1];
      const value = inline ?? (next !== undefined && /^\d+$/.test(next) ? argv[++i] : undefined);
      parsed.window = value === undefined ? DEFAULT_WINDOW_MINUTES : Number(value);
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (!arg.startsWith("-")) {
      parsed.positionals.push(arg);
    }
  }
  return parsed;
}

function splitFlag(arg: string): [string, string | undefined] {
  const eq = arg.indexOf("=");
  return eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)];
}
