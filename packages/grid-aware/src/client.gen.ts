// GENERATED FILE - do not edit by hand.
// Run `npm run generate:client` (openapi-typescript against ../../worker/openapi.json).
export interface paths {
    "/v1/intensity": {
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
    "/v1/zones": {
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
                /** @description Electricity Maps' supported zone list, proxied so clients never need their own token */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ZoneList"];
                    };
                };
                /** @description This deployment has no Electricity Maps token configured */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Electricity Maps failed to respond */
                502: {
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
            source: "electricitymaps" | "neso";
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
                 * @description "actual" = measured (NESO national, when available), "forecast" = NESO's forward estimate (national fallback and all regional data), "estimated" = Electricity Maps' modeled figure, "unknown" = an upstream provider failed or returned unusable data.
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
            /** @description Present when a GB request was redirected from NESO to Electricity Maps because the caller wasn't UK-origin, or when the intended upstream provider failed and `band`/`type` fell back to "unknown". */
            fallback?: {
                reason: string;
            };
        };
        Error: {
            error: {
                message: string;
                /** @enum {string} */
                provider?: "electricitymaps" | "neso";
            };
        };
        ZoneList: {
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
