import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const outDir = fileURLToPath(new URL("../public/grid-aware", import.meta.url));
mkdirSync(outDir, { recursive: true });

async function bundle(entryName: string, format: "esm" | "iife", outName: string): Promise<void> {
  const entryPoint = fileURLToPath(
    new URL(`../../packages/grid-aware/src/${entryName}`, import.meta.url),
  );
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format,
    target: "es2022",
    minify: true,
    write: false,
  });
  const bundled = result.outputFiles[0]?.text;
  if (!bundled) throw new Error(`esbuild produced no output for ${entryName}`);

  const outPath = fileURLToPath(new URL(`../public/grid-aware/${outName}`, import.meta.url));
  writeFileSync(outPath, bundled);
  console.log(`Wrote ${outPath}`);
}

await bundle("index.ts", "esm", "index.js");
// A classic (non-module) build: document.currentScript only resolves for these,
// and only a classic script can run synchronously/blocking without async or defer.
await bundle("browser-blocking.ts", "iife", "blocking.js");
