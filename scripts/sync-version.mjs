import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(`${rootDir}package.json`, "utf8"));

function syncVersion(relativePath) {
  const path = `${rootDir}${relativePath}`;
  const contents = JSON.parse(readFileSync(path, "utf8"));
  if (contents.version === version) return;
  contents.version = version;
  writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
  console.log(`Updated ${relativePath} to ${version}`);
}

syncVersion("worker/package.json");
syncVersion("packages/grid-aware/package.json");
syncVersion("packages/grid-aware/jsr.json");
