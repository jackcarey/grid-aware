# grid-aware-cloudflare-worker

The Cloudflare Worker that serves the grid-aware API. The API is [`packages/core`](../../packages/core). This package adds the Cloudflare parts and the static site.

| Path | |
|---|---|
| `src/index.ts` | Worker entry. Gives the core Cloudflare's edge cache, `request.cf` location and rate limit bindings. |
| `src/pages/` | Landing page source. |
| `public/` | Static assets: landing page and the browser widget bundles. Generated, but committed. |
| `wrangler.toml` | Routes, assets and rate limit bindings. |
| `test/` | Tests that run in the Workers runtime. |

## Settings

| Name | Kind | |
|---|---|---|
| `ELECTRICITY_MAPS_TOKEN` | secret | Optional. Without it, non-GB zones use CO2.js annual averages. |
| `ALLOWED_ORIGINS` | secret | Comma-separated origins allowed to call `/v2/*`. `https://*.example.com` matches subdomains but not `example.com`. |
| `GB_REGIONAL_RATE_LIMITER` | binding | 1 request per 60 seconds. Past it, GB regional requests share one all-regions fetch. |
| `API_RATE_LIMITER` | binding | 100 requests per 60 seconds across all callers. Past it, requests are rejected. |
| `ASSETS` | binding | Serves `public/`. |

## Run

```
cp .dev.vars.example .dev.vars    # fill in the two settings
npm run dev
```

Requests to `/v2/*` need an `Origin` or `Referer` in `ALLOWED_ORIGINS`.

## Deploy

```
npx wrangler login
npx wrangler secret put ELECTRICITY_MAPS_TOKEN
npx wrangler secret put ALLOWED_ORIGINS
npx wrangler deploy
```

Declaring any `routes` entry disables the `*.workers.dev` URL unless `workers_dev = true` is set. `wrangler.toml` sets it.

## Scripts

| Script | |
|---|---|
| `npm run dev` | `wrangler dev` |
| `npm run deploy` | `wrangler deploy` |
| `npm run generate:site` | Rebuilds `public/` from the OpenAPI spec and the browser package. Run from the repo root as `npm run generate`. |
| `npm test` | Cloudflare adapter tests |
