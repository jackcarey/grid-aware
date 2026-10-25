# Proxmox VE

Cron on the Proxmox host runs the [gate](../../integrations/gate) for deferrable host jobs: a ZFS scrub, package updates, template rebuilds. Not intended for for backups or time-sensitive workflows.

## Install

```
install -m 755 ../../integrations/gate/grid-aware-gate.sh /usr/local/bin/grid-aware-gate
```

```
# /etc/default/grid-aware
GRID_AWARE_API_URL=https://your-grid-aware-api.example.com
GRID_AWARE_ORIGIN=https://pve.example.com
GRID_AWARE_QUERY=regionid=13   # GB DNO region 13 (London). postcode=SW1A also works.
GRID_AWARE_MAX_WAIT_MINUTES=720
```

## Cron

```
# /etc/cron.d/grid-aware-scrub
# Due Sundays 01:00 (an example). Runs at the cleanest time before the deadline, or 12 hours later at the latest.
0 1 * * 0     root  /usr/local/bin/grid-aware-gate due zfs-scrub
*/30 * * * *  root  /usr/local/bin/grid-aware-gate run zfs-scrub -- zpool scrub rpool
```

Check the setup first. This reports what would happen and runs nothing:

```
grid-aware-gate --dry-run run zfs-scrub -- zpool scrub rpool
```
