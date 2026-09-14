# grid-aware

Combines [Electricity Maps](https://electricitymaps.com) (global grid carbon intensity) with the
[NESO Carbon Intensity API](https://carbonintensity.org.uk) (UK DNO regions) behind one API, plus a tiny browser package that reflects the current intensity as a `data-grid-aware` attribute on a page. A Cloudflare wrapper is set up, so with no explicit zone/postcode/regionid, the API defaults to its detected location.

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

`/v1/*` requests need a matching `Origin`/`Referer` header.

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
