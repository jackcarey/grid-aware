import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { introHtml } from "../src/pages/intro.html.js";

interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string; enum?: unknown[]; default?: unknown };
}

interface OpenApiSchema {
  $ref?: string;
  type?: string;
  enum?: unknown[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  additionalProperties?: OpenApiSchema | boolean;
  description?: string;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: OpenApiSchema }>;
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  responses?: Record<string, OpenApiResponse>;
}

interface OpenApiDocument {
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

function resolveSchema(schema: OpenApiSchema, doc: OpenApiDocument): OpenApiSchema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.replace("#/components/schemas/", "");
  return doc.components?.schemas?.[name] ?? schema;
}

/** Renders a schema as a pseudo-TypeScript shape, e.g. `{ foo: string, bar?: number }`. */
function renderSchemaType(schema: OpenApiSchema, doc: OpenApiDocument, indent = 0): string {
  const resolved = resolveSchema(schema, doc);
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);

  if (resolved.enum) {
    return resolved.enum.map((value) => JSON.stringify(value)).join(" | ");
  }

  if (resolved.properties) {
    const required = new Set(resolved.required ?? []);
    const lines = Object.entries(resolved.properties).map(([key, propSchema]) => {
      const optional = required.has(key) ? "" : "?";
      return `${padInner}${key}${optional}: ${renderSchemaType(propSchema, doc, indent + 1)}`;
    });
    return `{\n${lines.join("\n")}\n${pad}}`;
  }

  if (resolved.additionalProperties && typeof resolved.additionalProperties === "object") {
    return `{ [key: string]: ${renderSchemaType(resolved.additionalProperties, doc, indent)} }`;
  }

  if (resolved.type === "array" && resolved.items) {
    return `${renderSchemaType(resolved.items, doc, indent)}[]`;
  }

  return resolved.type ?? "unknown";
}

interface FieldDoc {
  path: string;
  type: string;
  description: string;
}

/** Flattens a schema's properties (recursively) into a field/type/description table's rows. */
function collectFieldDocs(schema: OpenApiSchema, doc: OpenApiDocument, prefix = ""): FieldDoc[] {
  const resolved = resolveSchema(schema, doc);

  if (resolved.properties) {
    return Object.entries(resolved.properties).flatMap(([key, propSchema]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      const resolvedProp = resolveSchema(propSchema, doc);
      const row: FieldDoc = {
        path,
        type: renderSchemaType(propSchema, doc),
        description: resolvedProp.description ?? "",
      };
      return [row, ...collectFieldDocs(propSchema, doc, path)];
    });
  }

  if (resolved.additionalProperties && typeof resolved.additionalProperties === "object") {
    return collectFieldDocs(resolved.additionalProperties, doc, prefix ? `${prefix}.*` : "*");
  }

  if (resolved.type === "array" && resolved.items) {
    return collectFieldDocs(resolved.items, doc, prefix);
  }

  return [];
}

function renderFieldDocs(schema: OpenApiSchema, doc: OpenApiDocument): string {
  const rows = collectFieldDocs(schema, doc).filter((row) => row.description);
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (row) =>
        `<tr><td><code>${escapeHtml(row.path)}</code></td><td><pre>${escapeHtml(row.type)}</pre></td><td>${escapeHtml(row.description)}</td></tr>`,
    )
    .join("\n");
  return `<table>
<thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
<tbody>${body}</tbody>
</table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderParameters(parameters: OpenApiParameter[] | undefined): string {
  if (!parameters || parameters.length === 0) return "<p><em>No parameters.</em></p>";
  const rows = parameters
    .map((param) => {
      const type = param.schema?.enum
        ? param.schema.enum.map(String).join(" | ")
        : (param.schema?.type ?? "string");
      const defaultValue = param.schema?.default !== undefined ? String(param.schema.default) : "";
      return `<tr><td><code>${escapeHtml(param.name)}</code></td><td>${escapeHtml(param.in)}</td><td>${param.required ? "yes" : "no"}</td><td><code>${escapeHtml(type)}</code></td><td>${escapeHtml(defaultValue)}</td></tr>`;
    })
    .join("\n");
  return `<table>
<thead><tr><th>Name</th><th>In</th><th>Required</th><th>Type</th><th>Default</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

function renderResponses(
  responses: Record<string, OpenApiResponse> | undefined,
  doc: OpenApiDocument,
): string {
  if (!responses) return "";
  const sections = Object.entries(responses)
    .map(([status, resp]) => {
      const schema = resp.content?.["application/json"]?.schema;
      if (!schema) {
        return `<h4><code>${escapeHtml(status)}</code> - ${escapeHtml(resp.description ?? "")}</h4>`;
      }
      return `<h4><code>${escapeHtml(status)}</code> - ${escapeHtml(resp.description ?? "")}</h4>
<pre>${escapeHtml(renderSchemaType(schema, doc))}</pre>
${renderFieldDocs(schema, doc)}`;
    })
    .join("\n");
  return sections;
}

function renderApiReference(doc: OpenApiDocument): string {
  const sections = Object.entries(doc.paths)
    .flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => `
<section>
  <h3><code>${method.toUpperCase()} ${escapeHtml(path)}</code></h3>
  ${op.summary ? `<p>${escapeHtml(op.summary)}</p>` : ""}
  ${op.description ? `<p>${escapeHtml(op.description)}</p>` : ""}
  <h4>Parameters</h4>
  ${renderParameters(op.parameters)}
  <h4>Responses</h4>
  ${renderResponses(op.responses, doc)}
</section>`),
    )
    .join("\n");

  return `<h2 id="api-reference">API reference <small>v${escapeHtml(doc.info.version)}</small></h2>
${doc.info.description ? `<p>${escapeHtml(doc.info.description)}</p>` : ""}
<p>Raw spec: <a href="/openapi.json">/openapi.json</a></p>
${sections}`;
}

const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>',
)}`;

function renderPage(doc: OpenApiDocument): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.info.title)}</title>
<link rel="icon" href="${FAVICON_HREF}">
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #111; background: #fff; }
  code, pre { background: #f2f2f2; padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
  pre { padding: 1rem; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1.5rem; }
  th, td { text-align: left; border-bottom: 1px solid #ddd; padding: 0.4rem 0.6rem; font-size: 0.9em; vertical-align: top; }
  td pre { margin: 0.5rem 0 0; white-space: pre-wrap; }
  section { margin-bottom: 2.5rem; }
  footer { margin-top: 3rem; font-size: 0.85em; color: #555; border-top: 1px solid #ddd; padding-top: 1rem; }
  a { color: #0a5; }
  #live-intensity { display: inline-block; padding: 0.3rem 0.8rem; border-radius: 999px; background: #eee; }
  html[data-grid-aware="low"] #live-intensity { background: #d4f7d4; }
  html[data-grid-aware="moderate"] #live-intensity { background: #fff3c4; }
  html[data-grid-aware="high"] #live-intensity { background: #ffd8b0; }
  html[data-grid-aware="very-high"] #live-intensity { background: #ffb3b3; }
</style>
</head>
<body>
  <a href="https://jackcarey.co.uk" title="back to jackcarey.co.uk">&lt; main site</a>
  <main>
${introHtml}
${renderApiReference(doc)}
  </main>
<footer>
  GB data from NESO's Carbon Intensity API, licensed
  <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
  Global data from <a href="https://electricitymaps.com">Electricity Maps</a>.
</footer>
</body>
</html>
`;
}

const specPath = fileURLToPath(new URL("../openapi.json", import.meta.url));
const doc = JSON.parse(readFileSync(specPath, "utf8")) as OpenApiDocument;
const html = renderPage(doc);

const outDir = fileURLToPath(new URL("../public", import.meta.url));
mkdirSync(outDir, { recursive: true });
const outPath = fileURLToPath(new URL("../public/index.html", import.meta.url));
writeFileSync(outPath, html);
console.log(`Wrote ${outPath}`);
