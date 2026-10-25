# Forgejo and Codeberg

[`gated.yml`](gated.yml) goes in `.forgejo/workflows/`. It runs every 30 minutes and calls the [gate](../../integrations/gate). The Forgejo runner docs describe no pre-job hook, so this is a workflow, not a runner setting.

## Runner

The gate keeps its state in a file, so the workflow needs a runner you host with the `host` label type, or a container with a mounted volume. Install the gate on it:

```
install -m 755 ../../integrations/gate/grid-aware-gate.sh /usr/local/bin/grid-aware-gate
```

`host` runs jobs with no isolation. Use it only on a machine that can take the repository's workflows.

## Codeberg

Codeberg's shared runners start empty on every run, so the gate cannot remember that it already ran. Use a runner you host.

Set `GRID_AWARE_ORIGIN` to an origin in the API's `ALLOWED_ORIGINS`, e.g. `https://codeberg.org/your-user`.
