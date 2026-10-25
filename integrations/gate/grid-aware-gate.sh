#!/bin/sh
# Runs a command at the cleanest time before its deadline. Each work item is due at some time and
# may wait up to a max wait; the gate asks the API when the best window before that deadline starts
# and runs the command once that is now. It never sleeps: call it from a frequent tick (every 30
# minutes). Each due instance runs exactly once.
#
#   grid-aware-gate.sh due NAME                        mark NAME as due now (event-triggered work)
#   grid-aware-gate.sh run NAME -- COMMAND...          run COMMAND if NAME is due and the gate opens
#   grid-aware-gate.sh run NAME --due HH:MM -- COMMAND...
#                                                      same, but NAME falls due daily at HH:MM UTC
#   grid-aware-gate.sh check                           exit 0 if the best window starts now, 1 if later
#   grid-aware-gate.sh --dry-run run|due ...           say what would happen; run nothing, write nothing
#
# Settings come from /etc/default/grid-aware (if present) or the environment:
#   GRID_AWARE_API_URL           base URL of a grid-aware API (required, otherwise the gate is always open)
#   GRID_AWARE_ORIGIN            sent as the Origin header; the API must list it in ALLOWED_ORIGINS
#   GRID_AWARE_QUERY             where to measure, as a query string, e.g. regionid=13 or postcode=SW1A
#   GRID_AWARE_MAX_BAND          optional: low, moderate or high. Run at the earliest window at or below
#                                this band instead of waiting for the cleanest one
#   GRID_AWARE_DURATION_MINUTES  how long the job runs (default 30)
#   GRID_AWARE_MAX_WAIT_MINUTES  longest an instance may stay due before it runs anyway (default 360)
#   GRID_AWARE_TICK_MINUTES      how often the gate is called (default 30)
#   GRID_AWARE_WITHIN_MINUTES    for check: how far ahead to look (default: the max wait)
#   GRID_AWARE_STATE_DIR         where due and done markers live (default /var/lib/grid-aware)
#   GRID_AWARE_DRY_RUN           anything but empty, 0 or false is the same as --dry-run
#   GRID_AWARE_NOW               unix time to use instead of the clock, for tests
#
# The gate is open (the command runs) when the API can't be reached, so a carbon check is never what
# stops work from happening. Needs only sh, curl and date.

[ -f /etc/default/grid-aware ] && . /etc/default/grid-aware

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

duration="${GRID_AWARE_DURATION_MINUTES:-30}"
max_wait=$(( ${GRID_AWARE_MAX_WAIT_MINUTES:-360} * 60 ))
tick=$(( ${GRID_AWARE_TICK_MINUTES:-30} * 60 ))
state="${GRID_AWARE_STATE_DIR:-/var/lib/grid-aware}"
now="${GRID_AWARE_NOW:-$(date +%s)}"

# 2026-10-25T13:00:00.000Z -> unix seconds. Plain arithmetic, since date -d is not portable.
# The leading 1 on each field stops 08 and 09 reading as octal.
iso_to_epoch() {
  t="$1"
  y=${t%%-*}; r=${t#*-}
  mo=${r%%-*}; r=${r#*-}
  d=${r%%T*}; r=${r#*T}
  h=${r%%:*}; r=${r#*:}
  mi=${r%%:*}; r=${r#*:}
  s=${r%%[.Z]*}
  mo=$(( 1$mo - 100 )); d=$(( 1$d - 100 )); h=$(( 1$h - 100 )); mi=$(( 1$mi - 100 )); s=$(( 1$s - 100 ))
  [ "$mo" -le 2 ] && y=$(( y - 1 ))
  era=$(( y / 400 ))
  yoe=$(( y - era * 400 ))
  doy=$(( (153 * ((mo + 9) % 12) + 2) / 5 + d - 1 ))
  doe=$(( yoe * 365 + yoe / 4 - yoe / 100 + doy ))
  echo $(( (era * 146097 + doe - 719468) * 86400 + h * 3600 + mi * 60 + s ))
}

# Prints when the best window starting within $1 minutes begins, as unix seconds. Fails if the lookup does.
best_start() {
  url="${GRID_AWARE_API_URL%/}/v2/suggest?duration=$duration&within=$1${GRID_AWARE_MAX_BAND:+&band=$GRID_AWARE_MAX_BAND}"
  [ -n "$GRID_AWARE_QUERY" ] && url="$url&$GRID_AWARE_QUERY"
  body=$(curl -fsS --max-time 10 -H "Accept: application/json" ${GRID_AWARE_ORIGIN:+-H "Origin: $GRID_AWARE_ORIGIN"} "$url") || return 1
  start=$(printf '%s' "$body" | grep -o '"start":"[^"]*"' | head -n 1 | sed 's/"start":"\(.*\)"/\1/')
  [ -n "$start" ] || return 1
  iso_to_epoch "$start"
}

# 0 when the best window starts before the next tick, 1 when it is later. A failed lookup opens the gate.
window_is_open() {
  [ -n "$GRID_AWARE_API_URL" ] || return 0
  start_at=$(best_start "$1") || { echo "grid-aware: lookup failed, treating the gate as open" >&2; return 0; }
  if [ "$start_at" -le $(( now + tick )) ]; then
    echo "grid-aware: the best window starts now" >&2
    return 0
  fi
  echo "grid-aware: the best window starts in $(( (start_at - now) / 60 )) minutes" >&2
  return 1
}

case "${GRID_AWARE_DRY_RUN:-}" in
  "" | 0 | false) dry_run="" ;;
  *) dry_run=1 ;;
esac
if [ "$1" = "--dry-run" ]; then
  dry_run=1
  shift
fi

action="$1"
case "$action" in
  check)
    window_is_open "${GRID_AWARE_WITHIN_MINUTES:-$(( max_wait / 60 ))}"
    exit $?
    ;;
  due | run) ;;
  *) usage ;;
esac

name="$2"
[ -n "$name" ] || usage
shift 2
[ -n "$dry_run" ] || mkdir -p "$state" || exit 2

if [ "$action" = due ]; then
  if [ -n "$dry_run" ]; then
    echo "grid-aware: dry run, would mark $name as due" >&2
    exit 0
  fi
  # Already pending: keep the earlier time, so repeated events share one deadline.
  [ -f "$state/$name.due" ] || echo "$now" > "$state/$name.due"
  exit 0
fi

due_time=""
if [ "$1" = "--due" ]; then
  due_time="$2"
  shift 2
fi
[ "$1" = "--" ] && shift
[ "$#" -gt 0 ] || usage

if [ -n "$due_time" ]; then
  # Latest due instance at or before now, in UTC. The leading 1 stops 08 and 09 reading as octal.
  hour=$(( 1${due_time%%:*} - 100 ))
  minute=$(( 1${due_time##*:} - 100 ))
  due=$(( now - now % 86400 + hour * 3600 + minute * 60 ))
  [ "$due" -gt "$now" ] && due=$(( due - 86400 ))
else
  [ -f "$state/$name.due" ] || exit 0
  due=$(cat "$state/$name.due")
fi

done_at=$(cat "$state/$name.done" 2>/dev/null || echo 0)
[ "$due" -le "$done_at" ] && exit 0

age=$(( now - due ))
if [ -n "$due_time" ] && [ ! -f "$state/$name.done" ] && [ "$age" -ge "$max_wait" ]; then
  # First install: a deadline that has already passed was never ours to meet.
  if [ -n "$dry_run" ]; then
    echo "grid-aware: dry run, would skip $name: its deadline had already passed" >&2
  else
    echo "$due" > "$state/$name.done"
  fi
  exit 0
fi

if [ "$age" -ge "$max_wait" ]; then
  echo "grid-aware: $name has been due for $(( age / 60 )) minutes, running now" >&2
else
  remaining=$(( (max_wait - age + 59) / 60 ))
  if ! window_is_open "$remaining"; then
    echo "grid-aware: $name stays pending, $remaining minutes left before it runs anyway" >&2
    exit 0
  fi
fi

if [ -n "$dry_run" ]; then
  echo "grid-aware: dry run, would run $name: $*" >&2
  exit 0
fi

# Marked before running, so a command that fails is not retried on every tick.
echo "$due" > "$state/$name.done"
[ -z "$due_time" ] && rm -f "$state/$name.due"
exec "$@"
