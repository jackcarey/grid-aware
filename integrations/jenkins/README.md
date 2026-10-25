# grid-aware Jenkins plugin

Holds queued builds until a good enough time before their deadline. A held build uses no executor, and other jobs are not affected.

Data comes from a [grid-aware API](../../packages/core). For each held build the plugin asks [`/v2/suggest`](../../README.md#v2suggest) when the earliest window at or below the good-enough band starts before the build's deadline, and holds it until then. If no window qualifies, it uses the cleanest one.

## Setup

1. Install the `.hpi` from the [releases](https://github.com/jackcarey/grid-aware/releases).
2. Under **Manage Jenkins → System → Grid Aware**, set the API URL and a location (zone, UK postcode or region id).
3. Add the **Origin** value to the API's `ALLOWED_ORIGINS`. It defaults to your Jenkins URL.

Nothing is held until the API URL is set.

## Global settings

| Setting | Default | |
|---|---|---|
| Hold builds | on | Master switch. |
| API URL | none | |
| Origin | Jenkins URL | Sent as the `Origin` header. |
| Zone, UK postcode, UK region id | none | Unset means the API uses the controller's IP. |
| Longest hold (minutes) | `360` | The deadline, counted from when the build was queued. |
| Job length when unknown (minutes) | `30` | Used until Jenkins has an estimate for the job. |
| Let manually started builds through | on | |
| Most builds held at once | `0` | `0` is no cap. |
| Dry run | off | Log what would be held (lines starting "Dry run") and hold nothing. |
| Good enough band | `moderate` | `low`, `moderate` or `high`. Also the limit for [`gridAwareCheck`](#gridawarecheck). |

Every job is held unless it opts out. A job is released when any of these is true:

- a good enough window before its deadline starts now
- it has waited the longest hold
- a person started it and the bypass is on
- the API is unreachable or has not answered yet

The job length is Jenkins's own estimate for the job, rounded up to whole half-hours. Answers are cached for 15 minutes. Only the job is held, not the `node {}` blocks in a Pipeline.

## Per job

Under **Grid-aware builds**, or in a Pipeline:

```groovy
properties([gridAware(optOut: true)])
properties([gridAware(maxBand: 'low', maxDelayMinutes: 720, postcode: 'SW1A')])
```

## `gridAwareCheck`

Returns `true` if the grid is above the good-enough band right now. It does not wait, and it does not drop the build: the build carries on unless you ask otherwise.

```groovy
def dirty = gridAwareCheck()                        // true or false; the build carries on
gridAwareCheck(maxBand: 'low', result: 'NOT_BUILT')  // ends the build if above low
```

`result` (`NOT_BUILT`, `ABORTED` or `UNSTABLE`) is only for builds that can safely be skipped. Use it before `node {}`. With `dryRun: true` it logs what it would do and ends nothing.

## Develop

Needs JDK 21 and Maven.

```
cd integrations/jenkins
mvn -B verify
mvn hpi:run
```

GB data is from the NESO Carbon Intensity API, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
