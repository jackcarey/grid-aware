import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The defaults `grid-intensity` reads from its config file. */
export interface Config {
  provider?: string;
  location?: string;
}

/** Reads the same config file as `grid-intensity`, so both tools agree on defaults. */
export function readConfig(path = join(homedir(), ".config", "grid-intensity", "config.yaml")): Config {
  try {
    return parseConfig(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/** Only two flat keys are needed, which isn't worth a YAML dependency. */
export function parseConfig(text: string): Config {
  const config: Config = {};
  for (const line of text.split(/\r?\n/)) {
    const [, key, value] = /^(provider|location)\s*:\s*["']?(.*?)["']?\s*(?:#.*)?$/.exec(line) ?? [];
    if (key && value) config[key as keyof Config] = value;
  }
  return config;
}
