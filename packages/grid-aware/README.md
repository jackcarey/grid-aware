# @web-components/grid-aware

Sets a `data-grid-aware` attribute (`low` | `moderate` | `high` | `very-high` | `unknown`) on
`<html>`, reflecting the current grid carbon intensity from a [grid-aware worker](../../worker)
deployment. `unknown` means the fetch failed or the worker's own upstream provider failed.

## Drop-in `<script>` tag

```html
<script type="module"
        src="https://esm.sh/jsr/@web-components/grid-aware/browser"
        data-api-base-url="https://your-worker.example.workers.dev"></script>

<style>
  html[data-grid-aware="high"] video { display: none; }
</style>
```

Optional attributes on the same `<script>` tag: `data-zone`, `data-postcode`, `data-regionid`,
`data-max-age-ms`, `data-auto-refresh="false"`.

Since this is a JS module, the browser defers it: `data-grid-aware` gets set after the page has
already started rendering, which can flash the default styling for a moment.

## Blocking `<script>` tag (no flash, at a cost)

```html
<script src="https://your-worker.example.workers.dev/grid-aware/blocking.js"
        data-api-base-url="https://your-worker.example.workers.dev"></script>
```

A plain (non-module) build, meant to be placed early in `<head>`, before any CSS that keys off
`data-grid-aware`. It fetches synchronously, so the browser halts parsing until the response
arrives and the attribute is set, with zero flash of default styling. That's also the cost:
every page load stalls on a full network round-trip on the main thread. Only use it when
avoiding the flash matters more than that stall. Same optional attributes as the module build,
minus `data-max-age-ms`/`data-auto-refresh` (a one-shot blocking call has no caching or timer).

This build isn't published as an ES module (it can't be, and still block), so it's not available
through esm.sh the way the module build is. It's hosted directly by the worker deployment at
`/grid-aware/blocking.js`, or you can build your own from the `@web-components/grid-aware/browser-blocking`
JSR export with your own bundler.

## Programmatic use

```ts
import { initGridAware } from "@web-components/grid-aware";

const handle = initGridAware({
  apiBaseUrl: "https://your-worker.example.workers.dev",
  zone: "FR", // omit entirely to default to the visitor's own Cloudflare-detected country
  mapBand: (data) => data.carbonIntensity.band, // return value becomes the data-grid-aware value
});

// later
handle.stop();
```

`mapBand` receives the full `GridIntensityResponse` (value, band, location, etc. - `location.region`
carries GB DNO region detail for NESO regional responses), so you can also drive your own visible
UI from it, not just the `data-grid-aware` attribute.

`maxAgeMs` (default 30 minutes) is how long a fetched response is reused: a `refresh()` call within
that window reuses the cached data instead of hitting the network. Pass `0` to always fetch fresh.

`autoRefresh` (default `true`) controls whether a recurring timer calls `refresh()` automatically,
at the `maxAgeMs` cadence. Set it to `false` to only fetch on load and on your own explicit
`refresh()` calls.

## Fetching data directly

For anything beyond driving `data-grid-aware`, use the typed client:

```ts
import { createGridAwareClient } from "@web-components/grid-aware";

const client = createGridAwareClient("https://your-worker.example.workers.dev");

const current = await client.getCurrentIntensity({ zone: "FR" });
const forecast = await client.getForecast({ zone: "FR", horizon: "24h" }); // default horizon: "24h"
```

Both return a`GridIntensityResponse` but `getForecast`'s response has its
`forecast` array populated with one entry per period (30 minutes for NESO, 1 hour for Electricity Maps)

## Regenerating the API client

```
npm run generate:client
```

Runs `openapi-typescript` against `../../worker/openapi.json` and writes `src/client.gen.ts`.
Use this to regenerate whenever the worker's changes.
