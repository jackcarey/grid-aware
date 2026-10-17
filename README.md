# grid-aware

Combines [Electricity Maps](https://electricitymaps.com) (global grid carbon intensity) with the
[NESO Carbon Intensity API](https://carbonintensity.org.uk) (UK DNO regions) behind one API, falling back to Electricity Maps' annual averages via [CO2.js](https://www.thegreenwebfoundation.org/co2-js/) when live data is unavailable, plus a tiny browser package that reflects the current intensity as a `data-grid-aware` attribute on a page. A Cloudflare wrapper is set up, so with no explicit zone/postcode/regionid, the API defaults to its detected location.

## Packages

_version numbers are synced across packages_

- [`worker/`](worker) - the Cloudflare Worker API (Hono + `@hono/zod-openapi`), host-agnostic core
  with a thin Cloudflare-specific adapter in `src/platform/cloudflare.ts`.
- [`packages/grid-aware/`](packages/grid-aware) - `@web-components/grid-aware` on JSR, a small
  client + `<script>`-tag widget consuming the worker's API.

## Getting started

```
npm install
npm run generate      # writes worker/openapi.json, worker/src/pages/index.html.ts,
                       # worker/src/pages/widget.js.ts, and packages/grid-aware/src/client.gen.ts
npm run typecheck
npm test
```

### Running locally

```
cd worker
cp .dev.vars.example .dev.vars   # fill in ELECTRICITY_MAPS_TOKEN and ALLOWED_ORIGINS
npx wrangler dev
```

`/v2/*` and `/v1/*` requests need a matching `Origin`/`Referer` header.

`ELECTRICITY_MAPS_TOKEN` is optional. Without it, non-GB zones (and GB when NESO fails) are served
from CO2.js's bundled annual averages, with `source: "co2js"` and a `fallback.reason`, and
`/v2/zones` lists CO2.js's zones instead. Those figures are Electricity Maps data under ODbL, so
the `fallback.reason` text credits them.

### API versions

`/v2` is current. `/v1` returns the 1.x response shapes (no `surplus`), with `Deprecation: true`
and a `Link` header pointing to the `/v2` equivalent.

### Surplus (GB only)

`/v2/intensity?surplus=true` adds a `surplus` object to NESO responses. Pass a job length in
minutes instead of `true` (e.g. `surplus=90`, max 2880) to size `suggested.window`; `true` means 30.

| Field | |
| --- | --- |
| `bmrs.forecast[]` | NESO's National Surplus Forecast ([BMRS](https://bmrs.elexon.co.uk/surplus-forecast-and-margin) OCNMFD): MW at each day's peak half hour, 2-14 days ahead. GB-wide. |
| `derived.forecast[].percentageOfDemand` | Surplus as a % of forecast national demand (BMRS NDFD). |
| `derived.forecast[].dayRank` | 1 is the best day, by `percentageOfDemand` (raw MW if there's no demand forecast). Ties share a rank. |
| `derived.regional.renewablePercentage` | Wind + solar + hydro share of the region's current mix. Regional requests only. |
| `derived.suggested.window` | Lowest average intensity window in the next 48 hours that fits the job. Earliest wins a tie. |
| `derived.suggested.day` | Soonest day with `dayRank` 1. |

`derived` figures are calculated by grid-aware, not published by NESO or Elexon. BMRS data is
cached for an hour. If BMRS is down, the BMRS-based fields are left out.

### Deploying

```
cd worker
npx wrangler login                        # once
npx wrangler secret put ELECTRICITY_MAPS_TOKEN
npx wrangler secret put ALLOWED_ORIGINS
npx wrangler deploy
```

If you add a custom domain via a `routes` entry in `wrangler.toml`, also set `workers_dev = true`
explicitly - otherwise Wrangler disables the `*.workers.dev` subdomain as soon as any route is
declared. The same `routes` entry also changes what `wrangler dev` reports as the request origin
locally (it simulates the configured hostname), so local testing against `localhost` can behave
differently once a custom domain is configured.

### Publishing the browser package

Requires the `web-components` scope on jsr.io and that scope's GitHub repo linked as a Trusted
Publisher. Publishing is automatic: bump the version in root `package.json` and push to `main` (see
Versioning below) - CI tags the release, and `npx jsr publish` runs from there. To publish locally
instead:

```
cd packages/grid-aware
npx jsr publish
```

## Versioning

Root `package.json`'s `version` is the single source of truth for the whole repo. `npm run
generate` (run in CI, and in the pre-commit hook) copies it into `worker/package.json`,
`packages/grid-aware/package.json`, and `packages/grid-aware/jsr.json` via `scripts/sync-version.mjs`;
the OpenAPI `info.version` in `worker/src/app.ts` reads `worker/package.json` directly. So bumping
the version only means editing root `package.json` and committing the files the pre-commit hook
regenerates. Pushing that to `main` makes CI's `release` job cut the matching git tag / GitHub
release automatically, which triggers the JSR publish.

## License

[MIT](LICENSE)
