# Examples

Configs that use the [gate](../integrations/gate) to run deferrable work (nightly builds, scrubs, reindexing) at the cleanest time before a deadline. Copy and adapt.

| Platform | Example | "Already ran" state |
|---|---|---|
| Linux host, Proxmox | [`proxmox/`](proxmox) | file in `/var/lib/grid-aware/` |
| GitHub Actions | [`github-actions/gated.yml`](github-actions/gated.yml) | file on the self-hosted runner |
| GitLab CI | [`gitlab-ci/gated.gitlab-ci.yml`](gitlab-ci/gated.gitlab-ci.yml) | file on the shell runner |
| Forgejo | [`forgejo-runner/`](forgejo-runner) | file on the runner |
| Kubernetes | [`kubernetes/gated-job.yaml`](kubernetes/gated-job.yaml) | the suspended Job |

Every example runs the work by its deadline whatever the grid does, provided the schedule keeps ticking until then.

Hosted CI runners (GitHub-hosted, GitLab shared, Codeberg shared) are not covered. They start empty on every run, so the gate cannot remember that it already ran.

Jenkins and Harness are [integrations](../integrations), not examples.

Each example needs its `Origin` in the API's `ALLOWED_ORIGINS`.

To try a setup without running anything, set `GRID_AWARE_DRY_RUN=1` or pass `--dry-run` to the gate. It logs what it would do and changes nothing.

Status: the gate has tests. The platform configs have not been run on a real system.
