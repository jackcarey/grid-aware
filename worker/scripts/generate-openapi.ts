import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { createNoopAppDeps } from "../src/ports.js";

const app = createApp(createNoopAppDeps());
const response = await app.fetch(new Request("http://localhost/openapi.json"));
const doc = await response.json();

const outPath = fileURLToPath(new URL("../openapi.json", import.meta.url));
writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
