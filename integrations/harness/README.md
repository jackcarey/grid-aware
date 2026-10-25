# grid-aware for Harness

A Harness [step template](https://developer.harness.io/docs/platform/templates/run-step-template-quickstart/) for the [Docker plugin](../docker-plugin). It asks the API when the best time to start is and sets output variables. It never fails the step because of the grid, so no work is dropped.

## Use

1. Push the plugin image to a registry your Docker connector can reach.
2. Import [`step-template.yaml`](step-template.yaml) as a Step template and set its `image`.
3. Add the template as the first step of a stage.
4. Add the `origin` value to the API's `ALLOWED_ORIGINS`.

```yaml
- step:
    type: Template
    name: Grid schedule
    identifier: grid_schedule
    template:
      templateRef: grid_aware_schedule
      versionLabel: "2.1.0"
      templateInputs:
        type: Plugin
        spec:
          settings:
            api_url: https://your-grid-aware-api.example.com
            origin: https://app.harness.io
            postcode: SW1A
```

Settings and outputs are listed in the [plugin README](../docker-plugin#settings).

## Acting on the schedule

The outputs are `GRID_AWARE_START`, `GRID_AWARE_DELAY_SECONDS` and `GRID_AWARE_DIRTY`. For example, in a later step:

```yaml
when:
  stageStatus: Success
  condition: <+pipeline.stages.build.spec.execution.steps.grid_schedule.output.outputVariables.GRID_AWARE_DIRTY> == "false"
```

A pipeline has nowhere to keep state between runs, so the step cannot hold work or make sure it runs once. For work that must run by a deadline, run the pipeline from a trigger at the time you want and use the delay to decide what to do, or use the [gate](../gate) somewhere with a disk that persists.
