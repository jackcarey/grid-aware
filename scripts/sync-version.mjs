import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(`${rootDir}package.json`, "utf8"));

function syncVersion(relativePath) {
  const path = `${rootDir}${relativePath}`;
  const contents = JSON.parse(readFileSync(path, "utf8"));
  const before = JSON.stringify(contents);
  contents.version = version;
  if (JSON.stringify(contents) === before) return;
  writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
  console.log(`Updated ${relativePath} to ${version}`);
}

syncVersion("apps/cloudflare-worker/package.json");
syncVersion("packages/core/package.json");
syncVersion("packages/grid-aware/package.json");
syncVersion("packages/grid-aware/jsr.json");
syncVersion("packages/cli/package.json");
syncVersion("packages/cli/jsr.json");
syncVersion("integrations/docker-plugin/package.json");
syncVersion("integrations/gate/package.json");
