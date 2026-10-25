import { appendFileSync } from "node:fs";
import { run } from "./plugin.mjs";

// DRONE_OUTPUT and GITHUB_OUTPUT are both KEY=value files, so one writer covers either.
const outputFile = process.env.GRID_AWARE_OUTPUT || process.env.DRONE_OUTPUT || process.env.GITHUB_OUTPUT;

try {
  process.exitCode = await run(process.env, {
    writeOutput: outputFile
      ? (values) => appendFileSync(outputFile, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(""))
      : undefined,
  });
} catch (error) {
  console.error(`grid-aware: ${error.message}`);
  process.exitCode = 2;
}
