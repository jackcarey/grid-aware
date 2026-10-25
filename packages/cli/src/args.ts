/** Only the options that decide who handles a command. The rest is for `grid-intensity` to parse. */
export interface ParsedArgs {
  positionals: string[];
  provider?: string;
  location?: string;
  /** Minutes from `--window`. NaN if the value isn't a number, so the caller can reject it. */
  window?: number;
  help: boolean;
}

/** What a bare `--window` means, matching the API's `surplus=true`. */
export const DEFAULT_WINDOW_MINUTES = 30;
/** Matches the API's `surplus` limit. */
export const MAX_WINDOW_MINUTES = 2880;

/** Accepts `--flag value` and `--flag=value`, as grid-intensity does. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { positionals: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const [flag = "", inline] = arg.startsWith("--") ? arg.split(/=(.*)/s) : [arg];
    if (flag === "--provider") parsed.provider = inline ?? argv[++i];
    else if (flag === "--location") parsed.location = inline ?? argv[++i];
    else if (flag === "--window") {
      // The value is optional, so a following word is a command, not the value.
      const next = argv[i + 1];
      const value = inline ?? (next !== undefined && /^\d+$/.test(next) ? argv[++i] : undefined);
      parsed.window = value === undefined ? DEFAULT_WINDOW_MINUTES : Number(value);
    } else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (!arg.startsWith("-")) parsed.positionals.push(arg);
  }
  return parsed;
}
