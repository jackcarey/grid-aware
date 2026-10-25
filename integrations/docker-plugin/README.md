# grid-aware Docker plugin

A container that asks the API when to start some work and reports it. It reads environment variables and writes `KEY=value` outputs, so it runs in any CI that can run a container. The [Harness template](../harness) uses it.

It schedules; it never fails a step because of the grid, so no work is dropped. What happens next is up to the pipeline: start now, or wait for the start time. The image also contains the [gate](../gate) as `grid-aware-gate`, which holds work until its start time and always runs it by a deadline.

## Build

Build from the repo root, because the image includes the gate script:

```
docker build -f integrations/docker-plugin/Dockerfile -t your-registry/grid-aware-plugin:2.1.0 .
```

## Settings

`PLUGIN_<NAME>` also works, as Drone-style CIs pass step settings that way. `GRID_AWARE_<NAME>` wins if both are set.

| Variable | Default | |
|---|---|---|
| `GRID_AWARE_API_URL` | none | API base URL. Unset means start now. |
| `GRID_AWARE_ORIGIN` | none | Sent as `Origin`. Must be in the API's `ALLOWED_ORIGINS`. |
| `GRID_AWARE_ZONE`, `_POSTCODE`, `_REGIONID` | none | Location. Unset means the API uses the runner's IP. |
| `GRID_AWARE_DURATION_MINUTES` | `30` | How long the job runs. |
| `GRID_AWARE_MAX_WAIT_MINUTES` | `360` | The deadline: how far ahead to look. |
| `GRID_AWARE_MAX_BAND` | none | `low`, `moderate` or `high`. Pick the earliest window at or below it, not the cleanest. |
| `GRID_AWARE_TICK_MINUTES` | `30` | A start this far away or less counts as "now". |
| `GRID_AWARE_OUTPUT` | none | File to append `KEY=value` lines to. Falls back to `DRONE_OUTPUT`, then `GITHUB_OUTPUT`. |

Outputs:

| Name | |
|---|---|
| `GRID_AWARE_START` | When to start, ISO 8601 UTC. Never earlier than now. |
| `GRID_AWARE_DELAY_SECONDS` | Seconds until then. |
| `GRID_AWARE_DIRTY` | `true` if the start is later than a tick away. |

The exit code is 0 unless the settings are invalid (2). If the API is unreachable or gives no start time, the outputs say start now.

## Run

```
docker run --rm -e GRID_AWARE_API_URL=https://your-api.example.com \
  -e GRID_AWARE_ORIGIN=https://ci.example.com -e GRID_AWARE_POSTCODE=SW1A \
  your-registry/grid-aware-plugin:2.1.0
```

## The gate

The gate keeps its state in files, so mount a volume at `/var/lib/grid-aware`. It reads `GRID_AWARE_API_URL` and `GRID_AWARE_ORIGIN` like the plugin, and takes the location as `GRID_AWARE_QUERY` instead of the separate zone, postcode and region settings. See the [gate README](../gate#settings).

```
docker run --rm -v grid-aware-state:/var/lib/grid-aware --entrypoint grid-aware-gate \
  -e GRID_AWARE_API_URL=https://your-api.example.com \
  -e GRID_AWARE_ORIGIN=https://ci.example.com \
  -e GRID_AWARE_QUERY=regionid=13 \
  your-registry/grid-aware-plugin:2.1.0 run nightly --due 01:00 -- ./build.sh
```

## Tests

```
npm test --workspace integrations/docker-plugin
```

GB data is from the NESO Carbon Intensity API, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
