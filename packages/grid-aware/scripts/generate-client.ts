import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const specPath = fileURLToPath(
  new URL("../../../worker/openapi.json", import.meta.url),
);
const outPath = fileURLToPath(new URL("../src/client.gen.ts", import.meta.url));

const ast = await openapiTS(new URL(`file://${specPath}`));
const output = astToString(ast);

writeFileSync(
  outPath,
  `// GENERATED FILE - do not edit by hand.\n// Run \`npm run generate:client\` (openapi-typescript against ../../worker/openapi.json).\n${output}`,
);
console.log(`Wrote ${outPath}`);
