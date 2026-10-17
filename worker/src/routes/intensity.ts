import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { withAttribution } from "../attribution.js";
import {
  BMRS_CACHE_TTL_SECONDS,
  cachedJson,
  ELECTRICITY_MAPS_CACHE_TTL_SECONDS,
  NESO_CACHE_TTL_SECONDS,
  withEdgeCache,
} from "../cache.js";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  UpstreamError,
} from "../errors.js";
import { isUkRequest, toOutwardPostcode } from "../geo.js";
import {
  buildSurplus,
  normalizeBmrsSurplus,
  normalizeElectricityMapsForecast,
  normalizeElectricityMapsLatest,
  normalizeNesoNational,
  normalizeNesoRegional,
} from "../normalize.js";
import type { AppEnv, CacheStore } from "../ports.js";
import * as bmrs from "../providers/bmrs.js";
import * as co2js from "../providers/co2js.js";
import * as electricityMaps from "../providers/electricityMaps.js";
import * as neso from "../providers/neso.js";
import {
  cityForColo,
  nationFromRegionName,
  regionIdForCity,
  regionInfoFromNation,
} from "../regions.js";
import {
  ErrorResponseSchema,
  GridIntensityResponseSchema,
  GridIntensityResponseV1Schema,
} from "../schemas.js";
import type {
  BmrsSurplus,
  ForecastPoint,
  Horizon,
  IntensityBody,
  RegionInfo,
  SourcePreference,
} from "../types.js";

const QuerySchema = z.object({
  zone: z.string().optional().openapi({
    example: "FR",
    description:
      "Electricity Maps zone code. If omitted along with postcode/regionid, defaults to the caller's own location as detected by Cloudflare (a UK postcode where available, else the caller's country).",
  }),
  postcode: z.string().optional().openapi({ example: "SW1A" }),
  regionid: z.coerce.number().int().optional().openapi({ example: 13 }),
  horizon: z.enum(["latest", "24h", "48h"]).optional().default("latest"),
  source: z
    .enum(["auto", "electricitymaps", "neso"])
    .optional()
    .default("auto"),
  surplus: z
    .union([z.enum(["true", "false"]), z.coerce.number().int().min(1).max(2880)])
    .optional()
    .default("false")
    .openapi({
      example: 90,
      description:
        "Adds `surplus` to GB (NESO) responses. Pass a job length in minutes (max 2880) to size `surplus.derived.suggested.window`, or \"true\" for 30.",
    }),
});

const V1QuerySchema = QuerySchema.omit({ surplus: true });

type IntensityQuery = z.infer<typeof QuerySchema>;

const DEFAULT_JOB_MINUTES = 30;

export type ResolvedTarget =
  | { kind: "neso-national" }
  | { kind: "neso-regional"; postcode?: string; regionId?: number }
  | { kind: "electricitymaps"; zone: string; fallbackReason?: string };

/** Decides which upstream answers a request, from its subject, source preference and origin. */
export function resolveIntensityTarget(params: {
  zone?: string;
  postcode?: string;
  regionId?: number;
  source: SourcePreference;
  isUk: boolean;
}): ResolvedTarget {
  const { zone, postcode, regionId, source, isUk } = params;
  const hasRegionalSubject = postcode !== undefined || regionId !== undefined;

  if (source === "neso") {
    if (!isUk) {
      throw new ForbiddenError(
        "NESO data is only available to requests originating in the UK",
      );
    }
    if (hasRegionalSubject)
      return { kind: "neso-regional", postcode, regionId };
    if (zone === undefined || zone === "GB") return { kind: "neso-national" };
    throw new BadRequestError(
      "NESO has no data for zones outside Great Britain",
    );
  }

  if (source === "electricitymaps") {
    if (hasRegionalSubject) {
      throw new BadRequestError(
        "Electricity Maps has no equivalent to GB regional/postcode data",
      );
    }
    if (!zone)
      throw new BadRequestError("zone is required when source=electricitymaps");
    return { kind: "electricitymaps", zone };
  }

  // source === "auto"
  if (hasRegionalSubject) {
    if (!isUk) {
      throw new ForbiddenError(
        "NESO regional data is only available to requests originating in the UK",
      );
    }
    return { kind: "neso-regional", postcode, regionId };
  }

  if (zone === "GB") {
    if (!isUk) {
      return {
        kind: "electricitymaps",
        zone: "GB",
        fallbackReason:
          "NESO is restricted to UK-origin requests; served via Electricity Maps' GB zone instead",
      };
    }
    return { kind: "neso-national" };
  }

  if (!zone)
    throw new BadRequestError("One of zone, postcode, or regionid is required");
  return { kind: "electricitymaps", zone };
}

interface BmrsData {
  surplus: BmrsSurplus | undefined;
  demand: bmrs.BmrsDemandDaily[];
}

/**
 * Fetches BMRS's surplus and demand forecasts, shared by every GB caller. Raw data is cached, so
 * changing our response shape never serves a stale one, and each dataset is cached separately so
 * one outage doesn't block the other. Failures are swallowed: the intensity matters more.
 */
async function getBmrsData(cache: CacheStore, cacheKeyPrefix: string): Promise<BmrsData> {
  const [surplus, demand] = await Promise.all([
    cachedJson(`${cacheKeyPrefix}-ocnmfd`, BMRS_CACHE_TTL_SECONDS, cache, async () => {
      const { data } = await bmrs.getDailySurplus();
      // Throwing keeps an empty reply out of the cache.
      if (!data.length) throw new UpstreamError("BMRS returned no surplus forecast", "bmrs");
      return data;
    }).catch(() => undefined),
    cachedJson(`${cacheKeyPrefix}-ndfd`, BMRS_CACHE_TTL_SECONDS, cache, async () => (await bmrs.getDailyDemand()).data).catch(
      () => undefined,
    ),
  ]);
  return { surplus: surplus && normalizeBmrsSurplus(surplus), demand: demand ?? [] };
}

/** Adds the `surplus` field. */
function withSurplus(
  body: IntensityBody,
  data: BmrsData,
  next48h: readonly ForecastPoint[] | undefined,
  durationMinutes: number,
): IntensityBody {
  const surplus = buildSurplus({
    bmrs: data.surplus,
    demand: data.demand,
    regionalMix: body.generationMix,
    next48h,
    durationMinutes,
  });
  return surplus ? { ...body, surplus } : body;
}

/** Cache key part identifying which place a NESO target is about. */
function nesoTargetKey(target: Exclude<ResolvedTarget, { kind: "electricitymaps" }>): string {
  if (target.kind === "neso-national") return "national";
  if (target.postcode) return `postcode=${toOutwardPostcode(target.postcode) ?? target.postcode}`;
  return `regionid=${target.regionId}`;
}

/** Fetches and normalises the intensity for a resolved target. Throws on upstream failure. */
async function resolveResponse(
  target: ResolvedTarget,
  horizon: Horizon,
  electricityMapsToken: string | undefined,
  detectedNation: RegionInfo["nation"],
  cache: CacheStore,
  allRegionsCacheKey: string,
  isOverRegionalRateLimit: () => Promise<boolean>,
): Promise<IntensityBody> {
  if (target.kind === "electricitymaps") {
    if (!electricityMapsToken) {
      // So tokenless deployments fall back to CO2.js.
      throw new UpstreamError(
        "ELECTRICITY_MAPS_TOKEN is not configured on this deployment",
        "electricitymaps",
      );
    }
    // Electricity Maps zones have no GB DNO region
    const location = { zone: target.zone, region: { unknown: true } };
    if (horizon === "latest") {
      const raw = await electricityMaps.getLatestIntensity(
        electricityMapsToken,
        target.zone,
      );
      return normalizeElectricityMapsLatest(
        raw,
        location,
        target.fallbackReason,
      );
    }
    const raw = await electricityMaps.getForecast(
      electricityMapsToken,
      target.zone,
      horizon,
    );
    return normalizeElectricityMapsForecast(
      raw,
      location,
      target.fallbackReason,
    );
  }

  if (target.kind === "neso-national") {
    const raw = await neso.getNationalIntensity(horizon);
    return normalizeNesoNational(raw.data, {
      zone: "GB",
      region: regionInfoFromNation(detectedNation),
    });
  }

  // neso-regional
  let region: neso.NesoRegion | undefined;
  if (target.postcode) {
    // NESO's regional lookup wants the outward code - normalize whatever the caller gave.
    const outward = toOutwardPostcode(target.postcode) ?? target.postcode;
    region = (await neso.getRegionalByPostcode(outward, horizon)).data[0];
  } else if (await isOverRegionalRateLimit()) {
    // One NESO call returns all 14 regions - share it once GB regional traffic is rate-limited.
    const allRegions = await cachedJson(
      allRegionsCacheKey,
      NESO_CACHE_TTL_SECONDS,
      cache,
      () => neso.getRegionalNational(horizon),
    );
    region = allRegions.data.find((r) => r.regionid === target.regionId);
  } else {
    region = (
      await neso.getRegionalByRegionId(target.regionId as number, horizon)
    ).data[0];
  }
  if (!region)
    throw new UpstreamError("NESO returned no regional intensity data", "neso");
  return normalizeNesoRegional(region, {
    zone: "GB",
    region: { unknown: true }, // overwritten below with the actual DNO region
  });
}

/** Upstream failure doesn't break this endpoint, it returns unknown instead. */
function unknownIntensityResponse(
  target: ResolvedTarget,
  reason: string,
): IntensityBody {
  const location =
    target.kind === "electricitymaps"
      ? { zone: target.zone, region: { unknown: true } }
      : { zone: "GB", region: { unknown: true } };
  return {
    source: target.kind === "electricitymaps" ? "electricitymaps" : "neso",
    location,
    datetime: new Date().toISOString(),
    carbonIntensity: {
      value: null,
      unit: "gCO2eq/kWh",
      type: "unknown",
      band: "unknown",
    },
    fallback: { reason },
  };
}

const errorResponses = {
  400: {
    content: { "application/json": { schema: ErrorResponseSchema } },
    description: "Missing or invalid query parameters",
  },
  403: {
    content: { "application/json": { schema: ErrorResponseSchema } },
    description: "NESO-only data requested from a non-UK origin",
  },
};

const routeDocs = {
  summary: "Get combined grid carbon intensity",
  description:
    "Routes to NESO for GB and to Electricity Maps for everything else. Defaults to Cloudflare-detected location (postcode or city).",
};

const route = createRoute({
  method: "get",
  path: "/v2/intensity",
  request: { query: QuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: GridIntensityResponseSchema } },
      description: "Normalized grid carbon intensity for the requested location",
    },
    ...errorResponses,
  },
  ...routeDocs,
});

const v1Route = createRoute({
  method: "get",
  path: "/v1/intensity",
  request: { query: V1QuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: GridIntensityResponseV1Schema } },
      description: "1.x response shape. Use /v2/intensity.",
    },
    ...errorResponses,
  },
  ...routeDocs,
  deprecated: true,
});

/** Adds /v2/intensity, and /v1/intensity with its 1.x response shape. */
export function registerIntensityRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(route, async (c) => (await handleIntensity(c, c.req.valid("query"), withAttribution)) as never);
  app.openapi(
    v1Route,
    async (c) =>
      (await handleIntensity(c, { ...c.req.valid("query"), surplus: "false" }, (body) => body)) as never,
  );
}

/** Serves an intensity request, shaping the body with `present` for the API version. */
async function handleIntensity(
  c: Context<AppEnv>,
  query: IntensityQuery,
  present: (body: IntensityBody) => object,
): Promise<Response> {
  const { zone, postcode, regionid, horizon, source, surplus } = query;
  const deps = c.get("deps");
  const country = deps.getCountry(c.req.raw);
  const isUk = isUkRequest(country);

  // No explicit subject -> fall back to the caller's own detected location, so a bare request still resolves.
  const hasExplicitSubject =
    zone !== undefined || postcode !== undefined || regionid !== undefined;
  const detectedPostcode =
    hasExplicitSubject || !isUk ? undefined : deps.getPostcode(c.req.raw);
  const effectivePostcode = postcode ?? detectedPostcode;
  const effectiveZone =
    hasExplicitSubject || detectedPostcode ? zone : country;

  // Postcode isn't always reported - degrade through city (or colo as a proxy city), then nation.
  const detectedCity =
    hasExplicitSubject || !isUk || detectedPostcode
      ? undefined
      : (deps.getCity(c.req.raw) ?? cityForColo(deps.getColo(c.req.raw)));
  const detectedRegionId = regionIdForCity(detectedCity);
  const effectiveRegionId = regionid ?? detectedRegionId;
  const detectedNation =
    hasExplicitSubject || !isUk
      ? undefined
      : nationFromRegionName(deps.getRegion(c.req.raw));

  const target = resolveIntensityTarget({
    zone: effectiveZone,
    postcode: effectivePostcode,
    regionId: effectiveRegionId,
    source,
    isUk,
  });

  // The auto-detected case must not share a cache entry across different
  // visitors, since c.req.url is identical for all of them.
  const cacheKey = hasExplicitSubject
    ? c.req.url
    : detectedPostcode
      ? `${c.req.url}#postcode=${detectedPostcode}`
      : detectedRegionId !== undefined
        ? `${c.req.url}#regionid=${detectedRegionId}`
        : `${c.req.url}#country=${country ?? "unknown"}`;

  const cacheTtlSeconds =
    target.kind === "electricitymaps"
      ? ELECTRICITY_MAPS_CACHE_TTL_SECONDS
      : NESO_CACHE_TTL_SECONDS;
  const origin = new URL(c.req.url).origin;
  const allRegionsCacheKey = `${origin}/__cache/neso-regional-all?horizon=${horizon}`;
  const bmrsCacheKeyPrefix = `${origin}/__cache/bmrs`;

  let response: Response;
  try {
    response = await withEdgeCache(
      cacheKey,
      cacheTtlSeconds,
      deps.cache,
      async () => {
        const wantsSurplus = surplus !== "false" && target.kind !== "electricitymaps";
        const jobMinutes = typeof surplus === "number" ? surplus : DEFAULT_JOB_MINUTES;
        const resolve = (h: Horizon) =>
          resolveResponse(
            target,
            h,
            deps.electricityMapsToken,
            detectedNation,
            deps.cache,
            allRegionsCacheKey,
            deps.isOverRegionalRateLimit,
          );
        // Started before the intensity call so the upstreams run in parallel.
        const bmrsData = wantsSurplus ? getBmrsData(deps.cache, bmrsCacheKeyPrefix) : undefined;
        // The suggested window needs the next 48 hours, which a 48h request fetches anyway.
        const next48h =
          wantsSurplus && horizon !== "48h"
            ? cachedJson(
                `${origin}/__cache/neso-48h?${nesoTargetKey(target)}`,
                NESO_CACHE_TTL_SECONDS,
                deps.cache,
                async () => (await resolve("48h")).forecast ?? [],
              ).catch(() => undefined)
            : undefined;
        let body = await resolve(horizon);
        if (bmrsData) {
          const forecast48h = horizon === "48h" ? body.forecast : await next48h;
          body = withSurplus(body, await bmrsData, forecast48h, jobMinutes);
        }
        return c.json(present(body), 200);
      },
    );
  } catch (err) {
    // Caller-caused errors (bad config, forbidden) stay as errors; only upstream
    // failure falls back, and throwing before withEdgeCache resolves keeps it uncached.
    if (err instanceof ApiError && !(err instanceof UpstreamError)) throw err;
    let reason =
      err instanceof Error ? err.message : "Unknown upstream error";
    if (target.kind !== "electricitymaps" && deps.electricityMapsToken) {
      const gb = {
        kind: "electricitymaps",
        zone: "GB",
        fallbackReason: `${reason}; served via Electricity Maps' GB zone instead`,
      } as const;
      const body = await resolveResponse(
        gb,
        horizon,
        deps.electricityMapsToken,
        detectedNation,
        deps.cache,
        allRegionsCacheKey,
        deps.isOverRegionalRateLimit,
      ).catch((emErr: Error) => void (reason += `; ${emErr.message}`));
      if (body) return c.json(present(body), 200);
    }
    const zone = target.kind === "electricitymaps" ? target.zone : "GB";
    response = c.json(
      present(
        co2js.annualIntensity(zone, horizon, reason) ??
          unknownIntensityResponse(target, reason),
      ),
      200,
    );
  }
  return response;
}
