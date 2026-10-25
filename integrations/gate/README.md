# grid-aware-gate

Runs a command at a good time before its deadline. It exits straight away until then, so call it from cron or a CI schedule every 30 minutes.

Each piece of work has a due time and a max wait. On each call the gate asks the API's [`/v2/suggest`](../../README.md#v2suggest) when the best window starting before the deadline begins (with `GRID_AWARE_MAX_BAND`, the earliest window at or below that band). It runs the command once that is within a tick, or once the work has been due for the max wait. Each due time runs once.

```
grid-aware-gate.sh run NAME --due 01:00 -- COMMAND...   # due daily at 01:00 UTC
grid-aware-gate.sh due NAME                              # mark NAME due now
grid-aware-gate.sh run NAME -- COMMAND...                # run NAME if it is due
grid-aware-gate.sh check                                 # exit 0 if the best window starts now, 1 if later
grid-aware-gate.sh --dry-run run NAME -- COMMAND...      # say what would happen, change nothing
```

`due` on work that is already pending keeps the earlier time. `01:00` is an example: use the time the job would normally start.

## Settings

Environment variables, or `/etc/default/grid-aware`.

| Variable | Default | |
|---|---|---|
| `GRID_AWARE_API_URL` | none | API base URL. Unset means the gate is always open. |
| `GRID_AWARE_ORIGIN` | none | Sent as `Origin`. Must be in the API's `ALLOWED_ORIGINS`. |
| `GRID_AWARE_QUERY` | none | Location, e.g. `regionid=13`, `postcode=SW1A` or `zone=FR`. |
| `GRID_AWARE_MAX_BAND` | none | `low`, `moderate` or `high`. Run at the earliest window at or below it, instead of waiting for the cleanest. |
| `GRID_AWARE_DURATION_MINUTES` | `30` | How long the job runs. |
| `GRID_AWARE_MAX_WAIT_MINUTES` | `360` | Longest the work can stay due. |
| `GRID_AWARE_TICK_MINUTES` | `30` | How often the gate is called. |
| `GRID_AWARE_WITHIN_MINUTES` | max wait | For `check`: how far ahead to look. |
| `GRID_AWARE_STATE_DIR` | `/var/lib/grid-aware` | Where due and done markers are kept. |
| `GRID_AWARE_DRY_RUN` | off | Same as `--dry-run`. Anything but empty, `0` or `false` turns it on. |

In a dry run the gate still asks the API and reads state, but it runs nothing and writes no markers.

## Behaviour

- Every due time runs by its deadline whatever the grid does, as long as the gate is still being called then. Keep the ticks going until at least the due time plus the max wait.
- Works in every zone the API supports.
- API unreachable: the command runs.
- Scheduled work with no history whose deadline has already passed is marked done and not run.
- The done marker is written before the command starts. A failing command waits for the next due time.
- State is files, so it needs a disk that persists. It does not work on hosted CI runners.

Needs `sh`, `curl` and `date`.

## Tests

```
sh integrations/gate/test.sh
```
