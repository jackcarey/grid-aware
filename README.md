# grid-aware

Combines [Electricity Maps](https://electricitymaps.com) (global grid carbon intensity) with the
[NESO Carbon Intensity API](https://carbonintensity.org.uk) (UK DNO regions) behind one API, falling back to Electricity Maps' annual averages via [CO2.js](https://www.thegreenwebfoundation.org/co2-js/) when live data is unavailable, plus a tiny browser package that reflects the current intensity as a `data-grid-aware` attribute on a page. A Cloudflare wrapper is set up, so with no explicit zone/postcode/regionid, the API defaults to its detected location.

## Packages

_version numbers are synced across packages_

- [`packages/core/`](packages/core) - the host-agnostic API (Hono + `@hono/zod-openapi`): routes, providers,
  normalisation and the OpenAPI spec. It takes its platform pieces (cache, geolocation, rate limits) as
  dependencies, so it isn't tied to Cloudflare.
- [`apps/cloudflare-worker/`](apps/cloudflare-worker) - the Cloudflare Worker that runs the core: the adapter in `src/index.ts`,
  `wrangler.toml`, and the static landing page and widget bundle.
- [`packages/grid-aware/`](packages/grid-aware) - `@web-components/grid-aware` on JSR, a small
  client + `<script>`-tag widget consuming the worker's API.
- [`packages/cli/`](packages/cli) - a `grid-aware` command that wraps the Green Web Foundation's
  [`grid-intensity`](https://developers.thegreenwebfoundation.org/grid-intensity-cli/commands/) CLI and adds GB DNO regions.
- [`integrations/jenkins/`](integrations/jenkins) - a Jenkins plugin (Java, Maven) that holds queued builds
  while the grid is carbon-intensive.
- [`integrations/docker-plugin/`](integrations/docker-plugin) - a Drone-style CI plugin image that reports the best
  time to start, and includes the gate.
- [`integrations/harness/`](integrations/harness) - a Harness step template that uses the Docker plugin.
- [`integrations/gate/`](integrations/gate) - a shell script that runs deferrable work at the cleanest time
  before its deadline, using `/v2/suggest`. It never sleeps, so it suits cron and CI ticks.
- [`examples/`](examples) - copy-and-adapt configs that use the gate, for Proxmox, GitHub Actions, GitLab CI,
  Forgejo and Kubernetes; configs only, no code.

## How the integrations work

Every integration schedules first, then gates. It asks [`/v2/suggest`](#v2suggest) when the best time to start is, holds the work until then, and always runs it by a deadline, the max wait. A dirty grid delays work; it never drops it. If the API can't be reached, the work runs.

Where an integration can't hold work or remember that it ran, such as the [Docker plugin](integrations/docker-plugin) and [Harness](integrations/harness), it reports the schedule and leaves the decision to the pipeline.

## Examples

Configs for running deferrable work (nightly builds, scrubs, reindexing) at the cleanest time before a deadline. See the
[examples index](examples) for how they work and their limits.

| Platform | |
|---|---|
| Proxmox, Linux hosts | [`examples/proxmox`](examples/proxmox) |
| GitHub Actions | [`examples/github-actions`](examples/github-actions) |
| GitLab CI | [`examples/gitlab-ci`](examples/gitlab-ci) |
| Forgejo, Codeberg | [`examples/forgejo-runner`](examples/forgejo-runner) |
| Kubernetes | [`examples/kubernetes`](examples/kubernetes) |

Jenkins and Harness have their own packages under [`integrations/`](integrations).

## Getting started

```
npm install
npm run generate      # writes packages/core/openapi.json, packages/grid-aware/src/client.gen.ts,
                       # and apps/cloudflare-worker/public/ (landing page and widget bundles)
npm run typecheck
npm test
```

### Running locally

```
cd apps/cloudflare-worker
cp .dev.vars.example .dev.vars   # fill in ELECTRICITY_MAPS_TOKEN and ALLOWED_ORIGINS
npx wrangler dev
```

`/v2/*` requests need a matching `Origin`/`Referer` header.

`ELECTRICITY_MAPS_TOKEN` is optional. Without it, non-GB zones (and GB when NESO fails) are served
from CO2.js's bundled annual averages, with `source: "co2js"` and a `fallback.reason`, and
`/v2/zones` lists CO2.js's zones instead. Those figures are Electricity Maps data under ODbL, so
the `fallback.reason` text credits them.

### API versions

`/v2` is the only version. `/v1` was removed: use the `/v2` route with the same name.

### Surplus (GB only)

`/v2/intensity?surplus=true` adds a `surplus` object to NESO responses. Pass a job length in
minutes instead of `true` (e.g. `surplus=90`, max 2880) to size `suggested.window`; `true` means 30.

| Field | |
| --- | --- |
| `bmrs.forecast[]` | NESO's National Surplus Forecast ([BMRS](https://bmrs.elexon.co.uk/surplus-forecast-and-margin) OCNMFD): MW at each day's peak half hour, 2-14 days ahead. GB-wide. |
| `derived.forecast[].percentageOfDemand` | Surplus as a % of forecast national demand (BMRS NDFD). |
| `derived.forecast[].windPercentageOfCapacity` | Average forecast wind output as a % of wind capacity ([NESO 14-day wind forecast](https://www.neso.energy/data-portal/14-days-ahead-wind-forecasts)). Transmission-connected wind only. |
| `derived.forecast[].dayRank` | Rank for running deferrable compute, 1 being best. See [Day ranking](#day-ranking). |
| `derived.regional.renewablePercentage` | Wind + solar + hydro share of the region's current mix. Regional requests only. |
| `derived.suggested.window` | Best time in the next 48 hours. See [Suggested times](#suggested-times). |
| `derived.suggested.day` | Best day 2-14 days ahead. See [Suggested times](#suggested-times). |

`derived` figures are calculated by grid-aware, not published by NESO or Elexon. BMRS and wind
data are cached for an hour. If either source is down, the fields based on it are left out.

#### Suggested times

| Field | For jobs that can wait | Picks |
| --- | --- | --- |
| `window` | Up to 48 hours | Lowest average carbon intensity period that fits the job, from NESO's half-hourly forecast for the region (or GB). Earliest wins in there is a tie and `from` may be the current half-hour. |
| `day` | 2-14 days | The day with `dayRank` 1. |

#### `/v2/suggest`

Returns just the start time of the best window, for scheduling compute.

```
GET /v2/suggest?regionid=13&duration=90
```

```json
{
  "start": "2026-10-25T13:00:00.000Z",
  "end": "2026-10-25T14:30:00.000Z",
  "averageIntensity": 95,
  "unit": "gCO2eq/kWh",
  "durationMinutes": 90,
  "attribution": [{ "source": "neso", "...": "..." }]
}
```

| Parameter | |
| --- | --- |
| `zone`, `postcode`, `regionid` | Location, as for `/v2/intensity`. |
| `duration` | Job length in minutes, 1 to 2880. Default 30. |
| `within` | Latest the job may start, in minutes from now, 1 to 2880. Default: anywhere in the next 48 hours. |
| `band` | `low`, `moderate` or `high`. Return the earliest window in which every period is at or below it, instead of the cleanest. If there is none, the cleanest window is returned and `withinBand` is `false`. |

Works for every zone: GB from NESO's half-hourly forecast, elsewhere from Electricity Maps' hourly
forecast, so `duration` is rounded up to whole periods of that length. `start` is never earlier than
now. It is the current time, with a `fallback.reason`, when no window can be worked out, such as
when the forecast is unavailable. It picks windows the same way as `derived.suggested.window`.

#### Day ranking

Days are scored by:

1. Spare capacity (`surplus` above 0) first, so extra load doesn't land on a grid short of capacity.
2. Wind share, as a stand-in for lower carbon, since there's no intensity forecast this far ahead. Days within 5% of each other count as equal, as the forecast isn't that precise.
3. Higher `percentageOfDemand` (surplus as a % of forecast demand), since the same spare MW is more headroom on a quieter day. Raw MW is used if there's no demand forecast.
4. The earlier date, so no two days share a rank and compute happens sooner.

### CLI

`packages/cli` builds a `grid-aware` command with the same shape as the Green Web Foundation's
[`grid-intensity`](https://developers.thegreenwebfoundation.org/grid-intensity-cli/commands/)
(`--provider`, `--location`, `provider list`, `exporter`). `--provider NESO` adds GB DNO regions;
everything else is handed to the `grid-intensity` binary unchanged. The binary is downloaded and
checked on first use, so there's nothing else to install.

```
deno run -A jsr:@web-components/grid-aware-cli --provider NESO --location 13
npx jsr run @web-components/grid-aware-cli --provider NESO --location SW1A --window 90   # best time in the next 48h for a 90 minute job
npx jsr run @web-components/grid-aware-cli --location PT                                # plain grid-intensity
```

See [`packages/cli/README.md`](packages/cli/README.md) for locations, defaults, exit codes and how to
update the pinned `grid-intensity` version.

For the same suggested window from the browser package, see
[`getSuggestedWindow`](packages/grid-aware/README.md#suggested-time-to-run-a-job).

### Attribution

Responses include an `attribution` array with the credit text and licence link for each source
used. Keep these with the data if you display or redistribute it.

| `source` | Data | Terms |
| --- | --- | --- |
| `neso` | [NESO Carbon Intensity API](https://carbonintensity.org.uk) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [terms of use](https://github.com/carbon-intensity/terms/) |
| `electricitymaps` | [Electricity Maps](https://electricitymaps.com) | [Terms of service](https://electricitymaps.com/terms-of-service) |
| `co2js` | Electricity Maps annual averages via [CO2.js](https://www.thegreenwebfoundation.org/co2-js/) | [ODbL](https://opendatacommons.org/licenses/odbl/) |
| `neso-data-portal` | [NESO 14-day wind forecast](https://www.neso.energy/data-portal/14-days-ahead-wind-forecasts) | [NESO Open Data Licence](https://www.neso.energy/data-portal/neso-open-licence) |
| `bmrs` | [Elexon BMRS](https://bmrs.elexon.co.uk) | [BMRS data licence](https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/) |

### Deploying

```
cd apps/cloudflare-worker
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

### Publishing the browser package and CLI

Requires the `web-components` scope on jsr.io and that scope's GitHub repo linked as a Trusted
Publisher. Publishing is automatic: bump the version in root `package.json` and push to `main` (see
Versioning below) - CI tags the release, and `npx jsr publish` runs from there. To publish locally
instead:

```
cd packages/grid-aware
npx jsr publish
```

The CLI publishes the same way as `@web-components/grid-aware-cli` (it needs its own JSR package
under the scope and the same Trusted Publisher link). JSR gets the bundled `dist/cli.js`, so run
`npm run build:cli` before `npx jsr publish` in `packages/cli`.

## Versioning

Root `package.json`'s `version` is the single source of truth for the whole repo. `npm run
generate` (run in CI, and in the pre-commit hook) copies it into `apps/cloudflare-worker/package.json`,
`packages/core/package.json`, `packages/grid-aware/package.json`, `packages/grid-aware/jsr.json`, `packages/cli/package.json` and
`packages/cli/jsr.json`, `integrations/docker-plugin/package.json`, `integrations/gate/package.json` and the `<revision>` in
`integrations/jenkins/pom.xml` via `scripts/sync-version.mjs`;
the OpenAPI `info.version` in `packages/core/src/app.ts` reads `packages/core/package.json` directly. So bumping
the version only means editing root `package.json` and committing the files the pre-commit hook
regenerates. Pushing that to `main` makes CI's `release` job cut the matching git tag / GitHub
release automatically, which triggers the JSR publishes.

## License

[MIT](LICENSE)

Data sources have their own terms; see [Attribution](#attribution).
