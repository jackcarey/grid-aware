import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { withAttribution } from "../attribution.js";
import { bestWindow, earliestWindowWithin } from "../normalize.js";
import type { AppEnv } from "../ports.js";
import { SuggestionResponseSchema } from "../schemas.js";
import type { IntensityBody } from "../types.js";
import { errorResponses, handleIntensity, QuerySchema } from "./intensity.js";

const SuggestQuerySchema = QuerySchema.pick({ zone: true, postcode: true, regionid: true }).extend({
  duration: z.coerce.number().int().min(1).max(2880).optional().default(30).openapi({
    example: 90,
    description: "Job length in minutes (max 2880).",
  }),
  within: z.coerce.number().int().min(1).max(2880).optional().openapi({
    example: 360,
    description: "Latest the job may start, in minutes from now. Without it the whole next 48 hours is searched.",
  }),
  band: z.enum(["low", "moderate", "high"]).optional().openapi({
    example: "moderate",
    description:
      "Good enough: return the earliest window in which every period is at or below this band, rather than the cleanest. If there is none, the cleanest window is returned and `withinBand` is false.",
  }),
});

const route = createRoute({
  method: "get",
  path: "/v2/suggest",
  request: { query: SuggestQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: SuggestionResponseSchema } },
      description: "The best time to start a job of the given length in the next 48 hours",
    },
    ...errorResponses,
  },
  summary: "Suggest when to start a job",
  description:
    "The start of the lowest-intensity window in the next 48 hours that is long enough for the job, optionally limited to starting within a number of minutes. Works for every zone. When no window can be worked out it returns the current time with a `fallback` reason.",
});

/** Adds /v2/suggest. */
export function registerSuggestRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(route, async (c) => {
    const { zone, postcode, regionid, duration, within, band } = c.req.valid("query");
    const query = { zone, postcode, regionid, horizon: "48h", source: "auto", surplus: "false" } as const;
    return (await handleIntensity(c, query, (body) => suggestion(body, duration, within, band), {
      cacheRawBody: true,
    })) as never;
  });
}

/**
 * Works out the suggestion from a 48 hour body. The window can begin in the period already under
 * way, so `start` is never earlier than now. With no window it is now, and says why.
 */
function suggestion(
  body: IntensityBody,
  durationMinutes: number,
  within: number | undefined,
  band: "low" | "moderate" | "high" | undefined,
): object {
  const now = new Date();
  const bounds = {
    startAfter: now,
    startBefore: within === undefined ? undefined : new Date(now.getTime() + within * 60_000),
  };
  const good = band && body.forecast && earliestWindowWithin(body.forecast, durationMinutes, band, bounds);
  const window = good || (body.forecast && bestWindow(body.forecast, durationMinutes, bounds));
  const withinBand = band && window ? { withinBand: Boolean(good) } : {};
  const attribution = withAttribution(body).attribution;
  if (!window) {
    const reason = body.fallback?.reason ?? "No forecast was available";
    return {
      start: now.toISOString(),
      unit: "gCO2eq/kWh",
      durationMinutes,
      attribution,
      fallback: { reason },
    };
  }
  const from = new Date(window.from);
  return {
    start: (from > now ? from : now).toISOString(),
    end: new Date(window.to).toISOString(),
    averageIntensity: window.averageIntensity,
    unit: window.unit,
    durationMinutes,
    ...withinBand,
    attribution,
  };
}
