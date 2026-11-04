#!/usr/bin/env bash
set -e

#
# Runs the scratch-e2e example suite — scoped down to two modes (full/debug; see
# scratch-e2e/README.md for why). Not a real regression runner — scratch-e2e is an
# illustrative example, not a published part of this package.
#
# Called with no parameter at all (no 'full'/'debug', nothing else): runs with 'full'
# mode's own settings (log level, port, profile) but with NO tag filter applied at all —
# every feature file runs, tagged or not, including ones (e.g. request-docstring-body's
# own @Debug tag) that 'full'/'debug' would otherwise exclude/include selectively.
#

# No parameter at all: use 'full' settings below, but remember to drop CUCUMBER_TAGS
# afterwards so no tag filter applies — see the no-arguments note above.
NO_TAG_FILTER=0
if [ $# -eq 0 ]; then
  set -- full   # replace "$@" with "full"
  NO_TAG_FILTER=1
fi

export TEST_TIMESTAMP="$(date)"
export CUCUMBER_STEP_TIMEOUT=20000

# Set required environment vars based on type of run.
PROFILE=""
# Mirrors scratch-e2e/config/cucumber.js's own per-profile testAUTDetails['Scratch Target
# App'].port — kept here too (rather than read back out of that file) purely so this script
# can kill anything already on it below, before Cucumber ever starts.
TARGET_APP_PORT=""
case "$1" in
  full)
    export CUCUMBER_TAGS="@full or @Full"
    export TEST_LOG_LEVEL="Test Information"
    PROFILE="full"
    TARGET_APP_PORT=3999
    ;;
  debug)
    export CUCUMBER_TAGS="@debug or @Debug"
    export TEST_LOG_LEVEL="Test Debug"
    PROFILE="debug"
    TARGET_APP_PORT=3899
    ;;
  *)
    echo "Unknown mode [$1]. Expected 'full' or 'debug'." >&2
    exit 1
    ;;
esac

if [ "$NO_TAG_FILTER" -eq 1 ]; then
  export CUCUMBER_TAGS=""
fi

# Unconditionally kill anything already on the target-app's port — e.g. a previous run
# aborted (Ctrl-C) before its own AUT got closed, leaving the port held by a now-orphaned
# process. This is scratch-e2e's own call to make about its own example AUT, not something
# @controlium/framework does generically for every real AUT it manages (an actual AUT's
# port may not be this script's to unilaterally kill) — a real test suite that wants this
# guard provides it itself, same as here. `|| true` so this is a no-op, not a failure, if
# nothing's listening.
fuser -k "${TARGET_APP_PORT}/tcp" 2>/dev/null || true

export TEST_REPORT_TITLE="Scratch E2E Example"
export TEST_RESULTS_FOLDER="scratch-e2e/results"

# Clear the folder before running
if [ -d "$TEST_RESULTS_FOLDER" ]; then
  rm -rf "$TEST_RESULTS_FOLDER"/*
else
  mkdir -p "$TEST_RESULTS_FOLDER"
fi

# --- Standalone test server — started here, stopped when this script ends, full stop ------
#
# Genuinely independent of everything else in this script: never created/prepared/started
# via API_AUTWrapper, exists purely as a local, offline-safe stand-in for an external test
# API (the equivalent of httpbin.org) — see standalone-server/server.js's own doc comment
# for what it's actually for. Started before the build step so it's already up well before
# Cucumber ever runs; torn down via a trap so it's killed on *any* exit from this script
# (normal completion, a failing `set -e` step, or Ctrl-C) — not just the happy path.
export STANDALONE_SERVER_PORT=3998

# Unconditionally kill anything already on this port — e.g. a previous run's server left
# behind because that run's own script never cleanly exited (stopped/suspended rather than
# terminated, so its EXIT trap below never fired). `|| true` so this is a no-op, not a
# failure, if nothing's listening (or it disappears between check and kill) — not something
# worth failing the whole run over either way.
fuser -k "${STANDALONE_SERVER_PORT}/tcp" 2>/dev/null || true

mkdir -p "$TEST_RESULTS_FOLDER"
node scratch-e2e/standalone-server/server.js > "$TEST_RESULTS_FOLDER/standalone-server.log" 2>&1 &
STANDALONE_SERVER_PID=$!
trap 'kill "$STANDALONE_SERVER_PID" 2>/dev/null' EXIT

echo "Waiting for standalone test server (port $STANDALONE_SERVER_PORT) to be ready..."
STANDALONE_READY=0
for _ in $(seq 1 50); do
  if node -e "fetch('http://localhost:$STANDALONE_SERVER_PORT/headers').then(() => process.exit(0)).catch(() => process.exit(1))" 2>/dev/null; then
    STANDALONE_READY=1
    break
  fi
  sleep 0.1
done
if [ "$STANDALONE_READY" -ne 1 ]; then
  echo "Standalone test server did not become ready in time — see $TEST_RESULTS_FOLDER/standalone-server.log" >&2
  exit 1
fi
echo "Standalone test server ready."

# Track test execution exit code so we can exit this script with cucumber's own exit code
CUCUMBER_EXIT_CODE=0

# Temporarily disable exit on error to allow cucumber-js to fail but let us still generate
# a report and exit with cucumber's own exit code afterwards.
set +e
echo 'Starting scratch-e2e tests'
echo "PROFILE: common, $PROFILE"
if [ -n "$CUCUMBER_TAGS" ]; then
  echo "CUCUMBER_TAGS: $CUCUMBER_TAGS"
  echo "Running: cucumber-js --tags \"$CUCUMBER_TAGS\" --config scratch-e2e/config/cucumber.js -p common -p $PROFILE"
  npx cucumber-js --tags "$CUCUMBER_TAGS" --config scratch-e2e/config/cucumber.js -p common -p "$PROFILE"
else
  echo "CUCUMBER_TAGS: (none — running every feature, tagged or not)"
  echo "Running: cucumber-js --config scratch-e2e/config/cucumber.js -p common -p $PROFILE"
  npx cucumber-js --config scratch-e2e/config/cucumber.js -p common -p "$PROFILE"
fi
CUCUMBER_EXIT_CODE=$?
set -e

# Generate the report regardless of test exit code
echo "Generating report for $TEST_REPORT_TITLE"
node scratch-e2e/scripts/generate-report.js

# generate-report.js has openReportInBrowser: false — multiple-cucumber-html-reporter's own
# browser-opening (via the `open` npm package's detached+stdio-ignored spawn) was confirmed
# NOT to actually show a browser on this machine. A plain backgrounded xdg-open, inheriting
# this script's own stdio, does work.
REPORT_INDEX="$TEST_RESULTS_FOLDER/html-report/index.html"
if [ -f "$REPORT_INDEX" ]; then
  xdg-open "$REPORT_INDEX" &
fi

exit "$CUCUMBER_EXIT_CODE"

excellent