import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { ELECTRICITY_MAPS_CACHE_TTL_SECONDS, withEdgeCache } from "../cache.js";
import * as co2js from "../providers/co2js.js";
import * as electricityMaps from "../providers/electricityMaps.js";
import { ZoneListSchema } from "../schemas.js";
import type { AppEnv } from "../ports.js";

const route = createRoute({
  method: "get",
  path: "/v1/zones",
  responses: {
    200: {
      content: { "application/json": { schema: ZoneListSchema } },
      description: "Electricity Maps' supported zone list, proxied so clients never need their own token",
    },
  },
  summary: "List Electricity Maps zones",
});

export function registerZonesRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(route, async (c) => {
    const deps = c.get("deps");
    if (!deps.electricityMapsToken) return c.json(co2js.listZones(), 200);

    const response = await withEdgeCache(
      c.req.url,
      ELECTRICITY_MAPS_CACHE_TTL_SECONDS,
      deps.cache,
      async () => {
        const zones = await electricityMaps.listZones(deps.electricityMapsToken as string);
        return c.json(zones, 200);
      },
    ).catch(() => c.json(co2js.listZones(), 200));
    return response as never;
  });
}
