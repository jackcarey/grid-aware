import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { ELECTRICITY_MAPS_CACHE_TTL_SECONDS, withEdgeCache } from "../cache.js";
import { BadRequestError } from "../errors.js";
import * as electricityMaps from "../providers/electricityMaps.js";
import { ErrorResponseSchema, ZoneListSchema } from "../schemas.js";
import type { AppEnv } from "../ports.js";

const route = createRoute({
  method: "get",
  path: "/v1/zones",
  responses: {
    200: {
      content: { "application/json": { schema: ZoneListSchema } },
      description: "Electricity Maps' supported zone list, proxied so clients never need their own token",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "This deployment has no Electricity Maps token configured",
    },
    502: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Electricity Maps failed to respond",
    },
  },
  summary: "List Electricity Maps zones",
});

export function registerZonesRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(route, async (c) => {
    const deps = c.get("deps");
    if (!deps.electricityMapsToken) {
      throw new BadRequestError("ELECTRICITY_MAPS_TOKEN is not configured on this deployment");
    }

    const response = await withEdgeCache(
      c.req.url,
      ELECTRICITY_MAPS_CACHE_TTL_SECONDS,
      deps.cache,
      async () => {
        const zones = await electricityMaps.listZones(deps.electricityMapsToken as string);
        return c.json(zones, 200);
      },
    );
    return response as never;
  });
}
