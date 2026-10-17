import { z } from "@hono/zod-openapi";

export const BandSchema = z.enum(["low", "moderate", "high", "very-high", "unknown"]).openapi({
  example: "moderate",
  description:
    "Coarse category for the value. GB responses use NESO's own index (recalculated by NESO each year against GB's own grid); other zones use generic, approximate global thresholds since no equivalent official index exists worldwide. \"unknown\" means an upstream provider failed or returned unusable data, see `fallback.reason`.",
});

export const ForecastPointSchema = z
  .object({
    datetime: z.string().openapi({ description: "Start of this period, ISO 8601 UTC." }),
    validTo: z.string().optional().openapi({ description: "End of this period, when known." }),
    value: z
      .number()
      .nullable()
      .openapi({ description: "The carbon intensity figure, in `unit`. `null` when `band` is \"unknown\"." }),
    type: z.enum(["actual", "forecast", "estimated", "unknown"]),
    band: BandSchema,
    generationMix: z
      .array(
        z.object({
          fuel: z.string(),
          percentage: z.number(),
        }),
      )
      .optional()
      .openapi({ description: "Fuel mix for this period. Only present for NESO regional forecasts." }),
  })
  .openapi("ForecastPoint");

export const AttributionSchema = z
  .object({
    source: z.enum(["neso", "electricitymaps", "co2js", "bmrs"]),
    text: z.string().openapi({
      example: "Contains BMRS data © Elexon Limited copyright and database right 2026",
      description: "Credit required by the source's licence or terms.",
    }),
    licence: z.string().openapi({ description: "Licence or terms link." }),
    url: z.string().openapi({ description: "Data source link." }),
  })
  .openapi("Attribution");

const AttributionListSchema = z.array(AttributionSchema).openapi({
  description:
    "Credits for each source used in this response. Keep them with the data if you display or redistribute it.",
});

export const SurplusSchema = z
  .object({
    bmrs: z
      .object({
        unit: z.literal("MW"),
        publishTime: z.string().openapi({ description: "ISO 8601 UTC." }),
        forecast: z
          .array(
            z.object({
              date: z.string().openapi({ example: "2026-10-19", description: "UK local date." }),
              surplus: z.number().openapi({
                example: 6398,
                description:
                  "MW at the day's peak half hour.",
              }),
            }),
          )
          .openapi({ description: "2-14 days ahead." }),
      })
      .optional()
      .openapi({
        description:
          "NESO's National Surplus Forecast from Elexon BMRS (OCNMFD). GB-wide. Omitted if BMRS is unavailable.",
      }),
    derived: z
      .object({
        forecast: z
          .array(
            z.object({
              date: z.string().openapi({ example: "2026-10-19" }),
              percentageOfDemand: z.number().optional().openapi({
                example: 17.8,
                description:
                  "Surplus as a % of forecast national demand (BMRS NDFD). Absent when there's no demand forecast for the day.",
              }),
              dayRank: z.number().int().openapi({
                example: 1,
                description:
                  "1 is the best day, by `percentageOfDemand` (raw MW if there's no demand forecast). Ties share a rank.",
              }),
            }),
          )
          .optional()
          .openapi({ description: "One entry per `bmrs.forecast` day." }),
        regional: z
          .object({
            renewablePercentage: z.number().openapi({
              example: 62.5,
              description: "Wind + solar + hydro share of the region's current mix, as a %.",
            }),
          })
          .optional()
          .openapi({
            description:
              "A proxy, not a measured surplus. Regional responses only.",
          }),
        suggested: z
          .object({
            window: z
              .object({
                from: z.string().openapi({
                  description: "ISO 8601 UTC. May be the start of the current period.",
                }),
                to: z.string().openapi({ description: "ISO 8601 UTC." }),
                averageIntensity: z.number().openapi({ example: 42 }),
                unit: z.literal("gCO2eq/kWh"),
              })
              .optional()
              .openapi({
                description:
                  "Lowest average intensity window in the next 48 hours that fits the job length from `surplus`. Earliest wins a tie.",
              }),
            day: z
              .object({
                date: z.string().openapi({ example: "2026-10-23" }),
                surplus: z.number().openapi({ description: "MW." }),
                percentageOfDemand: z.number().optional(),
              })
              .optional()
              .openapi({
                description:
                  "Soonest day with `dayRank` 1.",
              }),
          })
          .optional()
          .openapi({
            description:
              "When to run deferrable compute.",
          }),
      })
      .optional()
      .openapi({
        description:
          "Calculated by grid-aware, not published by NESO or Elexon.",
      }),
  })
  .openapi("Surplus", {
    description:
      "Present on NESO responses when `surplus=true`.",
  });

export const GridIntensityResponseSchema = z
  .object({
    source: z.enum(["electricitymaps", "neso", "co2js"]).openapi({
      example: "neso",
      description: "Which upstream answered this request",
    }),
    location: z
      .object({
        zone: z.string().openapi({ description: "Electricity Maps zone code (always \"GB\" for NESO responses)." }),
        region: z
          .object({
            id: z.number().optional(),
            name: z.string().optional(),
            nation: z.enum(["England", "Scotland", "Wales"]).optional(),
            unknown: z.boolean().openapi({
              description: "True when none of id/name/nation could be determined for this request.",
            }),
          })
          .openapi({
            description:
              "GB DNO region detail, when known. id/name are only ever present for NESO regional responses; nation may be present on its own when only a coarser signal (e.g. Cloudflare's detected nation) was available.",
          }),
      })
      .openapi({
        description: "Echoes back where this response is about, so you never have to re-parse the request.",
      }),
    datetime: z.string().openapi({
      example: "2026-09-11T12:00:00.000Z",
      description: "Start of the reporting period, ISO 8601 UTC.",
    }),
    validTo: z.string().optional().openapi({ description: "End of the reporting period, when known." }),
    carbonIntensity: z
      .object({
        value: z
          .number()
          .nullable()
          .openapi({ example: 123, description: "The carbon intensity figure, in `unit`. `null` when `band` is \"unknown\"." }),
        unit: z.literal("gCO2eq/kWh"),
        type: z.enum(["actual", "forecast", "estimated", "unknown"]).openapi({
          description:
            "\"actual\" = measured (NESO national, when available), \"forecast\" = NESO's forward estimate (national fallback and all regional data), \"estimated\" = Electricity Maps' modeled figure (or its annual average, for CO2.js fallbacks), \"unknown\" = an upstream provider failed or returned unusable data.",
        }),
        band: BandSchema,
      })
      .openapi({ description: "The carbon intensity figure itself." }),
    generationMix: z
      .array(
        z.object({
          fuel: z.string(),
          percentage: z.number(),
        }),
      )
      .optional()
      .openapi({ description: "Fuel mix behind this figure. Only returned for NESO regional responses." }),
    forecast: z
      .array(ForecastPointSchema)
      .optional()
      .openapi({
        description:
          "Near-future periods covering the requested horizon window (NESO: 30-minute periods; Electricity Maps: hourly), including the period already summarized above. Present only when `horizon` is \"24h\" or \"48h\", and never for CO2.js fallbacks.",
      }),
    surplus: SurplusSchema.optional(),
    attribution: AttributionListSchema,
    fallback: z
      .object({
        reason: z.string(),
      })
      .optional()
      .openapi({
        description:
          "Present when a GB request was redirected from NESO to Electricity Maps because the caller wasn't UK-origin, or when the intended upstream provider failed. Failures fall back from NESO to Electricity Maps' GB zone, then to Electricity Maps' latest annual average via CO2.js (`source: \"co2js\"`), and only report `band`/`type` as \"unknown\" if the zone isn't in that dataset either.",
      }),
  })
  .openapi("GridIntensityResponse");

/** 1.x shape, kept for /v1. */
export const GridIntensityResponseV1Schema = GridIntensityResponseSchema.omit({
  attribution: true,
  surplus: true,
}).openapi("GridIntensityResponseV1");

const ZoneMapSchema = z.record(
  z.string(),
  z.object({
    zoneName: z.string().optional(),
    countryName: z.string().optional(),
  }),
);

/** 1.x shape, kept for /v1. */
export const ZoneListV1Schema = ZoneMapSchema.openapi("ZoneListV1");

export const ZoneListSchema = z
  .object({
    zones: ZoneMapSchema,
    attribution: AttributionListSchema,
  })
  .openapi("ZoneList");

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      message: z.string(),
      provider: z.enum(["electricitymaps", "neso", "bmrs"]).optional(),
    }),
  })
  .openapi("Error");
