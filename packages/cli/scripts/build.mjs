import { build } from "esbuild";

// Bundled because the worker providers it reuses import each other with .js specifiers that Node can't resolve from TS.
await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cli.js",
  banner: { js: "#!/usr/bin/env node" },
});
