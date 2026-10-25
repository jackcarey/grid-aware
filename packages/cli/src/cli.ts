import { readConfig } from "./config.js";
import { run } from "./main.js";
import { ensureBinary } from "./gwf.js";
import { queryNeso } from "./neso.js";
import { execGridIntensity } from "./passthrough.js";

process.exitCode = await run(process.argv.slice(2), {
  env: process.env,
  readConfig,
  exec: async (args, capture) => {
    // Fetched on the first pass-through call, so NESO queries never touch the network for it.
    if (!process.env.GRID_INTENSITY_BIN) {
      await ensureBinary((message) => process.stderr.write(`${message}
`)).catch(() => undefined);
    }
    return execGridIntensity(args, capture, process.env);
  },
  queryNeso,
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
});
