import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
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
  normalizeElectricityMapsForecast,
  normalizeElectricityMapsLatest,
  normalizeNesoNational,
  normalizeNesoRegional,
} from "../normalize.js";
import type { AppEnv, CacheStore } from "../ports.js";
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
} from "../schemas.js";
import type {
  GridIntensityResponse,
  Horizon,
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
});

export type ResolvedTarget =
  | { kind: "neso-national" }
  | { kind: "neso-regional"; postcode?: string; regionId?: number }
  | { kind: "electricitymaps"; zone: string; fallbackReason?: string };

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

/** One NESO call returns all 14 regions - share it once GB regional traffic is rate-limited. */
async function getSharedAllRegions(
  cache: CacheStore,
  cacheKey: string,
  horizon: Horizon,
): Promise<neso.NesoRegionalResponse> {
  const response = await withEdgeCache(
    cacheKey,
    NESO_CACHE_TTL_SECONDS,
    cache,
    async () => {
      const raw = await neso.getRegionalNational(horizon);
      return new Response(JSON.stringify(raw), { status: 200 });
    },
  );
  return (await response.json()) as neso.NesoRegionalResponse;
}

async function resolveResponse(
  target: ResolvedTarget,
  horizon: Horizon,
  electricityMapsToken: string | undefined,
  detectedNation: RegionInfo["nation"],
  cache: CacheStore,
  allRegionsCacheKey: string,
  isOverRegionalRateLimit: () => Promise<boolean>,
): Promise<GridIntensityResponse> {
  if (target.kind === "electricitymaps") {
    if (!electricityMapsToken) {
      throw new BadRequestError(
        "ELECTRICITY_MAPS_TOKEN is not configured on this deployment",
      );
    }
    // Electricity Maps zones have no GB DNO region concept, regardless of nation.
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
    const period = raw.data[0];
    if (!period)
      throw new UpstreamError(
        "NESO returned no national intensity data",
        "neso",
      );
    return normalizeNesoNational(period, {
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
    const allRegions = await getSharedAllRegions(
      cache,
      allRegionsCacheKey,
      horizon,
    );
    region = allRegions.data.find((r) => r.regionid === target.regionId);
  } else {
    region = (
      await neso.getRegionalByRegionId(target.regionId as number, horizon)
    ).data[0];
  }
  const period = region?.data[0];
  if (!region || !period)
    throw new UpstreamError("NESO returned no regional intensity data", "neso");
  return normalizeNesoRegional(region, period, {
    zone: "GB",
    region: { unknown: true }, // overwritten below with the actual DNO region
  });
}

/** Upstream failure shouldn't break callers who expect this endpoint to always answer. */
function unknownIntensityResponse(
  target: ResolvedTarget,
  reason: string,
): GridIntensityResponse {
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

const route = createRoute({
  method: "get",
  path: "/v1/intensity",
  request: { query: QuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: GridIntensityResponseSchema } },
      description:
        "Normalized grid carbon intensity for the requested location",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Missing or invalid query parameters",
    },
    403: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "NESO-only data requested from a non-UK origin",
    },
  },
  summary: "Get combined grid carbon intensity",
  description:
    "Routes to NESO for GB national/regional subjects (UK-origin requests only) and to Electricity Maps for everything else. With no zone/postcode/regionid at all, defaults to the caller's own Cloudflare-detected location - a UK postcode where available, else just the caller's country.",
});

export function registerIntensityRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(route, async (c) => {
    const { zone, postcode, regionid, horizon, source } = c.req.valid("query");
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
    const allRegionsCacheKey = `${new URL(c.req.url).origin}/__cache/neso-regional-all?horizon=${horizon}`;

    let response: Response;
    try {
      response = await withEdgeCache(
        cacheKey,
        cacheTtlSeconds,
        deps.cache,
        async () => {
          const body = await resolveResponse(
            target,
            horizon,
            deps.electricityMapsToken,
            detectedNation,
            deps.cache,
            allRegionsCacheKey,
            deps.isOverRegionalRateLimit,
          );
          return c.json(body, 200);
        },
      );
    } catch (err) {
      // Caller-caused errors (bad config, forbidden) stay hard errors; only upstream
      // failure falls back, and throwing before withEdgeCache resolves keeps it uncached.
      if (err instanceof ApiError && !(err instanceof UpstreamError)) throw err;
      const reason =
        err instanceof Error ? err.message : "Unknown upstream error";
      response = c.json(unknownIntensityResponse(target, reason), 200);
    }
    return response as never;
  });
}
