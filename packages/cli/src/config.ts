import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  provider?: string;
  location?: string;
}

/** Reads provider and location from grid-intensity's own config file, so both CLIs share one set of defaults. */
export function readConfig(path = join(homedir(), ".config", "grid-intensity", "config.yaml")): Config {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  return parseConfig(text);
}

/** Only flat `key: value` lines are needed, so this avoids a YAML dependency. */
export function parseConfig(text: string): Config {
  const config: Config = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(provider|location)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    const key = match?.[1] as keyof Config | undefined;
    const value = match?.[2]?.replace(/^["']|["']$/g, "");
    if (key && value) config[key] = value;
  }
  return config;
}
