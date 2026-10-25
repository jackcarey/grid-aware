#!/bin/sh
# Tests the gate against a stub /v2/suggest and a fake clock. Needs node (for the stub) and curl.
#   sh integrations/gate/test.sh
here=$(cd "$(dirname "$0")" && pwd)
gate="$here/grid-aware-gate.sh"
fail=0

state=$(mktemp -d)
out=$(mktemp)
port=8899

# The stub answers /v2/suggest with whatever start the request asks for (start=<unix seconds>), and
# remembers the last query string so the tests can check what the gate sent.
node -e "
let last = '';
require('http').createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/last') return res.end(last);
  last = url.search;
  const start = Number(url.searchParams.get('start'));
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ start: new Date(start * 1000).toISOString(), unit: 'gCO2eq/kWh', durationMinutes: 30, attribution: [] }));
}).listen($port);
" &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$state" "$out"' EXIT
sleep 1

day=$(node -e "console.log(Date.UTC(2026, 9, 25) / 1000)")
export GRID_AWARE_API_URL="http://127.0.0.1:$port"
export GRID_AWARE_STATE_DIR="$state"
export GRID_AWARE_MAX_WAIT_MINUTES=360

clock() { echo $(( day + (1${1%%:*} - 100) * 3600 + (1${1##*:} - 100) * 60 )); }

# tick NAME HH:MM OFFSET [extra gate args...] runs one tick at day + HH:MM, with the API saying the
# best window starts OFFSET minutes from then.
tick() {
  name=$1; at=$2; offset=$3; shift 3
  t=$(clock "$at")
  GRID_AWARE_QUERY="start=$(( t + offset * 60 ))" GRID_AWARE_NOW=$t \
    sh "$gate" run "$name" "$@" -- sh -c "echo ran-$name-$at >> $out" 2>/dev/null
}

expect() {
  want=$1; label=$2
  got=$(tr '\n' ' ' < "$out" | sed 's/ $//')
  if [ "$got" = "$want" ]; then echo "ok   $label"; else echo "FAIL $label: want [$want] got [$got]"; fail=1; fi
}

# First install after the window has passed: nothing runs.
tick nightly 12:00 0 --due 01:00
expect "" "first install after the deadline does not run"

# The next day's window.
day=$(( day + 86400 ))
tick nightly 00:30 0 --due 01:00
expect "" "before the due time nothing new runs"
tick nightly 01:00 180 --due 01:00
expect "" "a better window later: pending"
tick nightly 01:15 40 --due 01:00
expect "" "a window starting after the next tick: pending"
tick nightly 01:30 25 --due 01:00
expect "ran-nightly-01:30" "runs once the best window is within a tick"
tick nightly 01:45 0 --due 01:00
expect "ran-nightly-01:30" "does not run twice for one due instance"

# Following day: the best window is always later, so the max wait forces it.
day=$(( day + 86400 ))
: > "$out"
tick nightly 06:45 400 --due 01:00
expect "" "inside the max wait: pending"
tick nightly 07:00 400 --due 01:00
expect "ran-nightly-07:00" "forced exactly at due + max wait"
tick nightly 07:15 400 --due 01:00
expect "ran-nightly-07:00" "forced run is not repeated"

# What the gate asks the API.
day=$(( day + 86400 ))
: > "$out"
tick nightly 01:00 180 --due 01:00
q=$(curl -s "http://127.0.0.1:$port/last")
case "$q" in
  *"duration=30"*"within=360"*) echo "ok   asks for a 30 minute job within the time left" ;;
  *) echo "FAIL query: $q"; fail=1 ;;
esac
tick nightly 03:00 180 --due 01:00
q=$(curl -s "http://127.0.0.1:$port/last")
case "$q" in
  *"within=240"*) echo "ok   within shrinks as the deadline nears" ;;
  *) echo "FAIL query: $q"; fail=1 ;;
esac
export GRID_AWARE_DURATION_MINUTES=90
tick nightly 04:00 180 --due 01:00
q=$(curl -s "http://127.0.0.1:$port/last")
unset GRID_AWARE_DURATION_MINUTES
case "$q" in
  *"duration=90"*) echo "ok   passes the job length" ;;
  *) echo "FAIL query: $q"; fail=1 ;;
esac

export GRID_AWARE_MAX_BAND=moderate
tick nightly 05:00 180 --due 01:00
q=$(curl -s "http://127.0.0.1:$port/last")
unset GRID_AWARE_MAX_BAND
case "$q" in
  *"band=moderate"*) echo "ok   passes GRID_AWARE_MAX_BAND as band" ;;
  *) echo "FAIL query: $q"; fail=1 ;;
esac

# Event-triggered work with its own deadline.
: > "$out"
day=$(( day + 86400 ))
tick scrub 02:00 0
expect "" "nothing pending: nothing runs"
GRID_AWARE_NOW=$(( day + 2 * 3600 )) sh "$gate" due scrub
GRID_AWARE_NOW=$(( day + 3 * 3600 )) sh "$gate" due scrub
tick scrub 04:00 120
expect "" "event pending while the best window is later"
tick scrub 05:00 0
expect "ran-scrub-05:00" "event runs when the best window is now"
tick scrub 05:15 0
expect "ran-scrub-05:00" "event is cleared after it runs"
GRID_AWARE_NOW=$(( day + 6 * 3600 )) sh "$gate" due scrub
tick scrub 11:59 240
expect "ran-scrub-05:00" "second event is still pending just before its deadline"
tick scrub 12:00 240
expect "ran-scrub-05:00 ran-scrub-12:00" "second event is forced 6h after its own due time"

# check
t=$(clock 08:00)
GRID_AWARE_QUERY="start=$t" GRID_AWARE_NOW=$t sh "$gate" check 2>/dev/null
if [ $? -eq 0 ]; then echo "ok   check passes when the best window is now"; else echo "FAIL check should pass"; fail=1; fi
GRID_AWARE_QUERY="start=$(( t + 7200 ))" GRID_AWARE_NOW=$t sh "$gate" check 2>/dev/null
if [ $? -eq 1 ]; then echo "ok   check fails when the best window is later"; else echo "FAIL check should fail"; fail=1; fi

# The API being down must not hold work back.
: > "$out"
day=$(( day + 86400 ))
GRID_AWARE_NOW=$(( day + 3600 )) sh "$gate" due backup
GRID_AWARE_API_URL=http://127.0.0.1:1 GRID_AWARE_NOW=$(( day + 4000 )) \
  sh "$gate" run backup -- sh -c "echo ran-backup >> $out" 2>/dev/null
expect "ran-backup" "lookup failure opens the gate"

# Dry run says what would happen and changes nothing.
: > "$out"
day=$(( day + 86400 ))
GRID_AWARE_NOW=$(( day + 3600 )) sh "$gate" --dry-run due trial 2>/dev/null
if [ -f "$state/trial.due" ]; then echo "FAIL dry run marked the work due"; fail=1; else echo "ok   dry run does not mark work due"; fi

GRID_AWARE_NOW=$(( day + 3600 )) sh "$gate" due trial
t=$(clock 02:00)
msg=$(GRID_AWARE_QUERY="start=$t" GRID_AWARE_NOW=$t sh "$gate" --dry-run run trial -- echo hi 2>&1)
case "$msg" in
  *"would run trial: echo hi"*) echo "ok   dry run reports the command it would run" ;;
  *) echo "FAIL dry run message: $msg"; fail=1 ;;
esac
expect "" "dry run runs nothing"
if [ -f "$state/trial.done" ]; then echo "FAIL dry run wrote the done marker"; fail=1; else echo "ok   dry run leaves the work pending"; fi

export GRID_AWARE_DRY_RUN=1
tick trial 02:00 0
unset GRID_AWARE_DRY_RUN
expect "" "GRID_AWARE_DRY_RUN works like --dry-run"
tick trial 02:15 0
expect "ran-trial-02:15" "the real run still happens afterwards"

exit $fail
