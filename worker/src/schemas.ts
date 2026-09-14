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

export const GridIntensityResponseSchema = z
  .object({
    source: z.enum(["electricitymaps", "neso"]).openapi({
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
            "\"actual\" = measured (NESO national, when available), \"forecast\" = NESO's forward estimate (national fallback and all regional data), \"estimated\" = Electricity Maps' modeled figure, \"unknown\" = an upstream provider failed or returned unusable data.",
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
          "Near-future periods covering the requested horizon window (NESO: 30-minute periods; Electricity Maps: hourly), including the period already summarized above. Present only when `horizon` is \"24h\" or \"48h\".",
      }),
    fallback: z
      .object({
        reason: z.string(),
      })
      .optional()
      .openapi({
        description:
          "Present when a GB request was redirected from NESO to Electricity Maps because the caller wasn't UK-origin, or when the intended upstream provider failed and `band`/`type` fell back to \"unknown\".",
      }),
  })
  .openapi("GridIntensityResponse");

export const ZoneListSchema = z
  .record(
    z.string(),
    z.object({
      zoneName: z.string().optional(),
      countryName: z.string().optional(),
    }),
  )
  .openapi("ZoneList");

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      message: z.string(),
      provider: z.enum(["electricitymaps", "neso"]).optional(),
    }),
  })
  .openapi("Error");
