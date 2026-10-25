# grid-aware-cli

A drop-in front for the Green Web Foundation's [`grid-intensity`](https://developers.thegreenwebfoundation.org/grid-intensity-cli/commands/) CLI that adds GB DNO regional data from the NESO Carbon Intensity API. The GWF binary is downloaded on first use, so there's nothing else to install.

```
deno run -A jsr:@web-components/grid-aware-cli --provider NESO --location 13          # DNO region id (1-14)
deno run -A jsr:@web-components/grid-aware-cli --provider NESO --location london      # region name
deno run -A jsr:@web-components/grid-aware-cli --provider NESO --location SW1A        # postcode (full postcodes are cut to the outward code)
deno run -A jsr:@web-components/grid-aware-cli --provider NESO --location GB          # national
deno run -A jsr:@web-components/grid-aware-cli --provider NESO --location 13 --window 90   # the best time to run a 90 minute job
deno run -A jsr:@web-components/grid-aware-cli provider list                          # grid-intensity's list, plus NESO
deno run -A jsr:@web-components/grid-aware-cli --location PT                          # anything else runs grid-intensity as normal
```

Or with Node: `npx jsr run @web-components/grid-aware-cli --provider NESO --location 13`. Published on [JSR](https://jsr.io/@web-components/grid-aware-cli) with the browser package.

NESO queries are answered here and print the same fields as `grid-intensity`, so a script that reads one provider reads them all:

```json
[
	{
		"emissions_type": "average",
		"metric_type": "absolute",
		"provider": "NESO",
		"location": "London",
		"units": "gCO2e per kWh",
		"valid_from": "2026-10-25T08:30Z",
		"valid_to": "2026-10-25T09:00Z",
		"value": 95,
		"is_estimated": true
	}
]
```

`location` is the region name, or `GB`. `is_estimated` is true for forecasts. That shape has no room for the generation mix, intensity band or attribution, so use the [API](../../README.md) if you need those. NESO's CC BY credit is printed to stderr.

Every other invocation, including `exporter`, is passed to `grid-intensity` with its arguments untouched, so new upstream flags and providers work without changes here.

## `--window`

`--window <minutes>` (1-2880, a bare `--window` means 30) prints the best time to run a job instead of the current period: the lowest average carbon intensity period in the next 48 hours long enough for the job, from NESO's half-hourly forecast for the region (or GB). `valid_from` and `valid_to` are the window and `value` is its average. Earliest wins a tie, and `valid_from` may be the current half-hour. It only works with `--provider NESO`. For the multi-day suggestions, use the API.

## Defaults

Provider and location come from `--provider` / `--location`, then `GRID_INTENSITY_PROVIDER` / `GRID_INTENSITY_LOCATION`, then `~/.config/grid-intensity/config.yaml`, the same order `grid-intensity` uses.

`grid-aware exporter --provider NESO` isn't supported yet and exits with code 2.

Exit codes: 0 success, 1 upstream failure, 2 bad arguments or location, 127 couldn't get a `grid-intensity` binary. Pass-through calls return the binary's own code.

## The grid-intensity binary

The first command that needs `grid-intensity` (anything that isn't a NESO query) downloads the pinned release (v0.7.0, set in `gwf-version.json`) for your OS and CPU from GitHub, checks it against upstream's `checksums.txt`, and keeps it in your cache folder (`~/.cache`, `~/Library/Caches` or `%LOCALAPPDATA%`, under `grid-aware-cli/`). After that it works offline. NESO queries never download it. Linux, macOS and Windows on x64 and arm64 are supported.

The CLI looks for a binary in this order:

1. `GRID_INTENSITY_BIN`
2. the downloaded copy
3. `grid-intensity` on your `PATH` (used if the download fails)

grid-intensity-go is [Apache-2.0](https://github.com/thegreenwebfoundation/grid-intensity-go/blob/main/LICENSE). It's downloaded from the upstream release rather than redistributed here.

## Developing

```
npm run build:cli      # bundle to packages/cli/dist/cli.js
```

To move to a newer `grid-intensity`, change the version in `gwf-version.json`. The cache is per version, so users pick it up on their next run.
