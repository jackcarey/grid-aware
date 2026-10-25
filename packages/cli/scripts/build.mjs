import { build } from "esbuild";

// Bundled because JSR can't publish the worker code this imports from outside the package folder.
await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cli.js",
  banner: { js: "#!/usr/bin/env node" },
});
