import { readConfig } from "./config.js";
import { runGridIntensity } from "./gwf.js";
import { run } from "./main.js";
import { queryNeso } from "./neso.js";

process.exitCode = await run(process.argv.slice(2), {
  env: process.env,
  readConfig,
  exec: runGridIntensity,
  queryNeso,
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
});
