// GENERATED FILE - do not edit by hand.
// Run `npm run generate:client` (openapi-typescript against ../../worker/openapi.json).
export interface paths {
    "/v2/intensity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get combined grid carbon intensity
         * @description Routes to NESO for GB and to Electricity Maps for everything else. Defaults to Cloudflare-detected location (postcode or city).
         */
        get: {
            parameters: {
                query?: {
                    /** @description Electricity Maps zone code. If omitted along with postcode/regionid, defaults to the caller's own location as detected by Cloudflare (a UK postcode where available, else the caller's country). */
                    zone?: string;
                    postcode?: string;
                    regionid?: number | null;
                    horizon?: "latest" | "24h" | "48h";
                    source?: "auto" | "electricitymaps" | "neso";
                    /** @description Adds `surplus` to GB (NESO) responses. Pass a job length in minutes (max 2880) to size `surplus.derived.suggested.window`, or "true" for 30. */
                    surplus?: ("true" | "false") | number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Normalized grid carbon intensity for the requested location */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GridIntensityResponse"];
                    };
                };
                /** @description Missing or invalid query parameters */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description NESO-only data requested from a non-UK origin */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/intensity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get combined grid carbon intensity
         * @deprecated
         * @description Routes to NESO for GB and to Electricity Maps for everything else. Defaults to Cloudflare-detected location (postcode or city).
         */
        get: {
            parameters: {
                query?: {
                    /** @description Electricity Maps zone code. If omitted along with postcode/regionid, defaults to the caller's own location as detected by Cloudflare (a UK postcode where available, else the caller's country). */
                    zone?: string;
                    postcode?: string;
                    regionid?: number | null;
                    horizon?: "latest" | "24h" | "48h";
                    source?: "auto" | "electricitymaps" | "neso";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 1.x response shape. Use /v2/intensity. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GridIntensityResponseV1"];
                    };
                };
                /** @description Missing or invalid query parameters */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description NESO-only data requested from a non-UK origin */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v2/zones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Electricity Maps zones */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Electricity Maps' supported zone list, proxied so clients never need their own token. Falls back to the zones in CO2.js's annual dataset when there's no token or Electricity Maps is unreachable. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ZoneList"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/zones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Electricity Maps zones
         * @deprecated
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description 1.x response shape. Use /v2/zones. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ZoneListV1"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        GridIntensityResponse: {
            /**
             * @description Which upstream answered this request
             * @example neso
             * @enum {string}
             */
            source: "electricitymaps" | "neso" | "co2js";
            /** @description Echoes back where this response is about, so you never have to re-parse the request. */
            location: {
                /** @description Electricity Maps zone code (always "GB" for NESO responses). */
                zone: string;
                /** @description GB DNO region detail, when known. id/name are only ever present for NESO regional responses; nation may be present on its own when only a coarser signal (e.g. Cloudflare's detected nation) was available. */
                region: {
                    id?: number;
                    name?: string;
                    /** @enum {string} */
                    nation?: "England" | "Scotland" | "Wales";
                    /** @description True when none of id/name/nation could be determined for this request. */
                    unknown: boolean;
                };
            };
            /**
             * @description Start of the reporting period, ISO 8601 UTC.
             * @example 2026-09-11T12:00:00.000Z
             */
            datetime: string;
            /** @description End of the reporting period, when known. */
            validTo?: string;
            /** @description The carbon intensity figure itself. */
            carbonIntensity: {
                /**
                 * @description The carbon intensity figure, in `unit`. `null` when `band` is "unknown".
                 * @example 123
                 */
                value: number | null;
                /** @enum {string} */
                unit: "gCO2eq/kWh";
                /**
                 * @description "actual" = measured (NESO national, when available), "forecast" = NESO's forward estimate (national fallback and all regional data), "estimated" = Electricity Maps' modeled figure (or its annual average, for CO2.js fallbacks), "unknown" = an upstream provider failed or returned unusable data.
                 * @enum {string}
                 */
                type: "actual" | "forecast" | "estimated" | "unknown";
                /**
                 * @description Coarse category for the value. GB responses use NESO's own index (recalculated by NESO each year against GB's own grid); other zones use generic, approximate global thresholds since no equivalent official index exists worldwide. "unknown" means an upstream provider failed or returned unusable data, see `fallback.reason`.
                 * @example moderate
                 * @enum {string}
                 */
                band: "low" | "moderate" | "high" | "very-high" | "unknown";
            };
            /** @description Fuel mix behind this figure. Only returned for NESO regional responses. */
            generationMix?: {
                fuel: string;
                percentage: number;
            }[];
            /** @description Near-future periods covering the requested horizon window (NESO: 30-minute periods; Electricity Maps: hourly), including the period already summarized above. Present only when `horizon` is "24h" or "48h", and never for CO2.js fallbacks. */
            forecast?: components["schemas"]["ForecastPoint"][];
            surplus?: components["schemas"]["Surplus"];
            /** @description Credits for each source used in this response. Keep them with the data if you display or redistribute it. */
            attribution: components["schemas"]["Attribution"][];
            /** @description Present when a GB request was redirected from NESO to Electricity Maps because the caller wasn't UK-origin, or when the intended upstream provider failed. Failures fall back from NESO to Electricity Maps' GB zone, then to Electricity Maps' latest annual average via CO2.js (`source: "co2js"`), and only report `band`/`type` as "unknown" if the zone isn't in that dataset either. */
            fallback?: {
                reason: string;
            };
        };
        ForecastPoint: {
            /** @description Start of this period, ISO 8601 UTC. */
            datetime: string;
            /** @description End of this period, when known. */
            validTo?: string;
            /** @description The carbon intensity figure, in `unit`. `null` when `band` is "unknown". */
            value: number | null;
            /** @enum {string} */
            type: "actual" | "forecast" | "estimated" | "unknown";
            /**
             * @description Coarse category for the value. GB responses use NESO's own index (recalculated by NESO each year against GB's own grid); other zones use generic, approximate global thresholds since no equivalent official index exists worldwide. "unknown" means an upstream provider failed or returned unusable data, see `fallback.reason`.
             * @example moderate
             * @enum {string}
             */
            band: "low" | "moderate" | "high" | "very-high" | "unknown";
            /** @description Fuel mix for this period. Only present for NESO regional forecasts. */
            generationMix?: {
                fuel: string;
                percentage: number;
            }[];
        };
        /** @description Present on NESO responses when `surplus=true`. */
        Surplus: {
            /** @description NESO's National Surplus Forecast from Elexon BMRS (OCNMFD). GB-wide. Omitted if BMRS is unavailable. */
            bmrs?: {
                /** @enum {string} */
                unit: "MW";
                /** @description ISO 8601 UTC. */
                publishTime: string;
                /** @description 2-14 days ahead. */
                forecast: {
                    /**
                     * @description UK local date.
                     * @example 2026-10-19
                     */
                    date: string;
                    /**
                     * @description MW at the day's peak half hour.
                     * @example 6398
                     */
                    surplus: number;
                }[];
            };
            /** @description Calculated by grid-aware, not published by NESO or Elexon. */
            derived?: {
                /** @description One entry per `bmrs.forecast` day. */
                forecast?: {
                    /** @example 2026-10-19 */
                    date: string;
                    /**
                     * @description Surplus as a % of forecast national demand (BMRS NDFD). Absent when there's no demand forecast for the day.
                     * @example 17.8
                     */
                    percentageOfDemand?: number;
                    /**
                     * @description 1 is the best day, by `percentageOfDemand` (raw MW if there's no demand forecast). Ties share a rank.
                     * @example 1
                     */
                    dayRank: number;
                }[];
                /** @description A proxy, not a measured surplus. Regional responses only. */
                regional?: {
                    /**
                     * @description Wind + solar + hydro share of the region's current mix, as a %.
                     * @example 62.5
                     */
                    renewablePercentage: number;
                };
                /** @description When to run deferrable compute. */
                suggested?: {
                    /** @description Lowest average intensity window in the next 48 hours that fits the job length from `surplus`. Earliest wins a tie. */
                    window?: {
                        /** @description ISO 8601 UTC. May be the start of the current period. */
                        from: string;
                        /** @description ISO 8601 UTC. */
                        to: string;
                        /** @example 42 */
                        averageIntensity: number;
                        /** @enum {string} */
                        unit: "gCO2eq/kWh";
                    };
                    /** @description Soonest day with `dayRank` 1. */
                    day?: {
                        /** @example 2026-10-23 */
                        date: string;
                        /** @description MW. */
                        surplus: number;
                        percentageOfDemand?: number;
                    };
                };
            };
        };
        Attribution: {
            /** @enum {string} */
            source: "neso" | "electricitymaps" | "co2js" | "bmrs";
            /**
             * @description Credit required by the source's licence or terms.
             * @example Contains BMRS data © Elexon Limited copyright and database right 2026
             */
            text: string;
            /** @description Licence or terms link. */
            licence: string;
            /** @description Data source link. */
            url: string;
        };
        Error: {
            error: {
                message: string;
                /** @enum {string} */
                provider?: "electricitymaps" | "neso" | "bmrs";
            };
        };
        GridIntensityResponseV1: {
            /**
             * @description Which upstream answered this request
             * @example neso
             * @enum {string}
             */
            source: "electricitymaps" | "neso" | "co2js";
            /** @description Echoes back where this response is about, so you never have to re-parse the request. */
            location: {
                /** @description Electricity Maps zone code (always "GB" for NESO responses). */
                zone: string;
                /** @description GB DNO region detail, when known. id/name are only ever present for NESO regional responses; nation may be present on its own when only a coarser signal (e.g. Cloudflare's detected nation) was available. */
                region: {
                    id?: number;
                    name?: string;
                    /** @enum {string} */
                    nation?: "England" | "Scotland" | "Wales";
                    /** @description True when none of id/name/nation could be determined for this request. */
                    unknown: boolean;
                };
            };
            /**
             * @description Start of the reporting period, ISO 8601 UTC.
             * @example 2026-09-11T12:00:00.000Z
             */
            datetime: string;
            /** @description End of the reporting period, when known. */
            validTo?: string;
            /** @description The carbon intensity figure itself. */
            carbonIntensity: {
                /**
                 * @description The carbon intensity figure, in `unit`. `null` when `band` is "unknown".
                 * @example 123
                 */
                value: number | null;
                /** @enum {string} */
                unit: "gCO2eq/kWh";
                /**
                 * @description "actual" = measured (NESO national, when available), "forecast" = NESO's forward estimate (national fallback and all regional data), "estimated" = Electricity Maps' modeled figure (or its annual average, for CO2.js fallbacks), "unknown" = an upstream provider failed or returned unusable data.
                 * @enum {string}
                 */
                type: "actual" | "forecast" | "estimated" | "unknown";
                /**
                 * @description Coarse category for the value. GB responses use NESO's own index (recalculated by NESO each year against GB's own grid); other zones use generic, approximate global thresholds since no equivalent official index exists worldwide. "unknown" means an upstream provider failed or returned unusable data, see `fallback.reason`.
                 * @example moderate
                 * @enum {string}
                 */
                band: "low" | "moderate" | "high" | "very-high" | "unknown";
            };
            /** @description Fuel mix behind this figure. Only returned for NESO regional responses. */
            generationMix?: {
                fuel: string;
                percentage: number;
            }[];
            /** @description Near-future periods covering the requested horizon window (NESO: 30-minute periods; Electricity Maps: hourly), including the period already summarized above. Present only when `horizon` is "24h" or "48h", and never for CO2.js fallbacks. */
            forecast?: components["schemas"]["ForecastPoint"][];
            /** @description Present when a GB request was redirected from NESO to Electricity Maps because the caller wasn't UK-origin, or when the intended upstream provider failed. Failures fall back from NESO to Electricity Maps' GB zone, then to Electricity Maps' latest annual average via CO2.js (`source: "co2js"`), and only report `band`/`type` as "unknown" if the zone isn't in that dataset either. */
            fallback?: {
                reason: string;
            };
        };
        ZoneList: {
            zones: {
                [key: string]: {
                    zoneName?: string;
                    countryName?: string;
                };
            };
            /** @description Credits for each source used in this response. Keep them with the data if you display or redistribute it. */
            attribution: components["schemas"]["Attribution"][];
        };
        ZoneListV1: {
            [key: string]: {
                zoneName?: string;
                countryName?: string;
            };
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
