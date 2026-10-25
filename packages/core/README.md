# grid-aware-core

The grid-aware API with no hosting assumptions. It is a [Hono](https://hono.dev) app built on web-standard `Request` and `Response`. [`apps/cloudflare-worker`](../../apps/cloudflare-worker) runs it on Cloudflare.

## Routes

| Route | |
|---|---|
| `GET /v2/intensity` | Current intensity, forecast and, for GB, suggested run times. |
| `GET /v2/zones` | Supported zones. |
| `GET /v1/intensity`, `/v1/zones` | Deprecated. Same data in the 1.x shape. |
| `GET /openapi.json` | The OpenAPI spec. |

Parameters and response shapes are in [`openapi.json`](openapi.json).

## Providers

| Where | Source |
|---|---|
| GB | NESO Carbon Intensity API, plus BMRS and the NESO data portal for surplus |
| Elsewhere | Electricity Maps (needs a token) |
| Fallback | CO2.js annual averages |

Responses are cached for 30 minutes (NESO) or 60 minutes (Electricity Maps).

## Use

```ts
import { createApp, createNoopAppDeps } from "grid-aware-core";

const app = createApp(
  createNoopAppDeps({
    electricityMapsToken: "...",
    allowedOrigins: ["https://example.com"],
  }),
);

const response = await app.fetch(new Request("https://host/v2/intensity?zone=FR"));
```

`createApp` takes an `AppDeps` object. Each field is something the host has to provide:

| Field | |
|---|---|
| `electricityMapsToken` | Token, or `undefined` to use the fallback outside GB. |
| `allowedOrigins` | Origins allowed to call `/v1/*` and `/v2/*`. |
| `cache` | `get` and `set` with a TTL. `createInMemoryCacheStore()` is provided. |
| `getCountry`, `getPostcode`, `getCity`, `getRegion`, `getColo` | Location of the caller, from the host's edge. Return `undefined` if unknown. |
| `isOverRegionalRateLimit`, `isOverApiRateLimit` | Rate limit checks. |

`createNoopAppDeps` fills every field with a do-nothing default.

## Exports

| Import | |
|---|---|
| `grid-aware-core` | `createApp`, `createInMemoryCacheStore`, `createNoopAppDeps`, `parseAllowedOrigins`, `toOutwardPostcode`, types |
| `grid-aware-core/openapi.json` | The spec |
| `grid-aware-core/<file>` | Any file under `src/`, e.g. `grid-aware-core/providers/neso`. The CLI uses this. |

## Develop

```
npm run generate:openapi    # rewrites openapi.json
npm test --workspace packages/core
```

The version in `package.json` is the one `openapi.json` reports. It is synced from the root.
