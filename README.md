# grid-aware

Combines [Electricity Maps](https://electricitymaps.com) (global grid carbon intensity) with the
[NESO Carbon Intensity API](https://carbonintensity.org.uk) (UK DNO regions) behind one API, plus a tiny browser package that reflects the current intensity as a `data-grid-aware` attribute on a page. A Cloudflare wrapper is set up, so with no explicit zone/postcode/regionid, the API defaults to its detected location.

## Packages

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
cp .dev.vars.example .dev.vars   # fill in ELECTRICITY_MAPS_TOKEN
npx wrangler dev
```

### Deploying

```
cd worker
npx wrangler login                        # once
npx wrangler secret put ELECTRICITY_MAPS_TOKEN
npx wrangler deploy
```

If you add a custom domain via a `routes` entry in `wrangler.toml`, also set `workers_dev = true`
explicitly - otherwise Wrangler disables the `*.workers.dev` subdomain as soon as any route is
declared. The same `routes` entry also changes what `wrangler dev` reports as the request origin
locally (it simulates the configured hostname), so local testing against `localhost` can behave
differently once a custom domain is configured.

### Publishing the browser package

Requires the `web-components` scope on jsr.io and (for CI) that scope's GitHub repo linked as a
Trusted Publisher. Locally:

```
cd packages/grid-aware
npx jsr publish
```

## Versioning

One version number covers the whole repo. Bump it in all of these together: root `package.json`,
`worker/package.json`, `packages/grid-aware/package.json`, `packages/grid-aware/jsr.json`, the
OpenAPI `info.version` in `worker/src/app.ts`, and the git tag / GitHub release used to publish.

## License

[MIT](LICENSE)
