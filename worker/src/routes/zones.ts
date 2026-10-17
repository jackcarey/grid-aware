import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import { CO2JS_ATTRIBUTION, ELECTRICITY_MAPS_ATTRIBUTION } from "../attribution.js";
import { cachedJson, ELECTRICITY_MAPS_CACHE_TTL_SECONDS } from "../cache.js";
import * as co2js from "../providers/co2js.js";
import * as electricityMaps from "../providers/electricityMaps.js";
import { ZoneListSchema, ZoneListV1Schema } from "../schemas.js";
import type { AppEnv } from "../ports.js";
import type { ZoneListResponse } from "../types.js";

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
    200: { content: { "application/json": { schema: ZoneListV1Schema } }, description: "1.x response shape. Use /v2/zones." },
  },
  summary: "List Electricity Maps zones",
  deprecated: true,
});

/** The zone list from CO2.js, with its credit. */
function co2jsZones(): ZoneListResponse {
  return { zones: co2js.listZones(), attribution: [CO2JS_ATTRIBUTION] };
}

/** The zone list, from Electricity Maps when it's configured and reachable. */
async function getZones(c: Context<AppEnv>): Promise<ZoneListResponse> {
  const deps = c.get("deps");
  const token = deps.electricityMapsToken;
  if (!token) return co2jsZones();
  return cachedJson(
    `${new URL(c.req.url).origin}/__cache/electricitymaps-zones`,
    ELECTRICITY_MAPS_CACHE_TTL_SECONDS,
    deps.cache,
    async () => ({ zones: await electricityMaps.listZones(token), attribution: [ELECTRICITY_MAPS_ATTRIBUTION] }),
  ).catch(co2jsZones);
}

/** Adds /v2/zones, and /v1/zones with its 1.x response shape. */
export function registerZonesRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(route, async (c) => c.json(await getZones(c), 200));
  app.openapi(v1Route, async (c) => c.json((await getZones(c)).zones, 200));
}
