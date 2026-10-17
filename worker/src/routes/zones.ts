import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import { cachedJson, ELECTRICITY_MAPS_CACHE_TTL_SECONDS } from "../cache.js";
import * as co2js from "../providers/co2js.js";
import * as electricityMaps from "../providers/electricityMaps.js";
import { ZoneListSchema } from "../schemas.js";
import type { AppEnv } from "../ports.js";

const description =
  "Electricity Maps' supported zone list, proxied so clients never need their own token. Falls back to the zones in CO2.js's annual dataset when there's no token or Electricity Maps is unreachable.";

const route = createRoute({
  method: "get",
  path: "/v2/zones",
  responses: { 200: { content: { "application/json": { schema: ZoneListSchema } }, description } },
  summary: "List Electricity Maps zones",
});

const v1Route = createRoute({
  method: "get",
  path: "/v1/zones",
  responses: {
    200: { content: { "application/json": { schema: ZoneListSchema } }, description: "Use /v2/zones." },
  },
  summary: "List Electricity Maps zones",
  deprecated: true,
});

/** The zone list, from Electricity Maps when it's configured and reachable. */
async function getZones(c: Context<AppEnv>): Promise<electricityMaps.ElectricityMapsZones> {
  const deps = c.get("deps");
  const token = deps.electricityMapsToken;
  if (!token) return co2js.listZones();
  return cachedJson(
    `${new URL(c.req.url).origin}/__cache/electricitymaps-zones`,
    ELECTRICITY_MAPS_CACHE_TTL_SECONDS,
    deps.cache,
    () => electricityMaps.listZones(token),
  ).catch(() => co2js.listZones());
}

/** Adds /v2/zones, and the deprecated /v1/zones. */
export function registerZonesRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(route, async (c) => c.json(await getZones(c), 200));
  app.openapi(v1Route, async (c) => c.json(await getZones(c), 200));
}
