#!/usr/bin/env bash
#
# AnkiBrain demo capture pipeline.
#
# Boots a real Anki in a hermetic base folder (demo/out/anki-base) with the
# AnkiBrain add-on copied in place, drives the add-on's own UI through the
# demo add-on (demo/addon/), captures PNGs into docs/screenshots/ and writes
# docs/screenshots/manifest.json + index.md.
#
# The user's real collection, settings and add-on folder are never touched.
#
#   ./run.sh                 # the main pass
#   ./run.sh --pass main     # explicitly one pass
#   ./run.sh --only talk-answer,makecards-add-to-anki
#   ./run.sh --skip-ai       # drop shots tagged 'ai' (no API calls)
#   ./run.sh --probe         # capture-backend probe, writes demo/out/probe/
#   ./run.sh --list          # print the shot registry
#
# Everything scratch lives in demo/out/ (gitignored).
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/.." && pwd)"
OUT_DIR="$DEMO_DIR/out"
BASE_DIR="$OUT_DIR/anki-base"
LOG_DIR="$OUT_DIR/logs"
SHOT_DIR="$REPO_ROOT/docs/screenshots"

ANKI_BIN="${ANKI_BIN:-anki}"
# The Anki-side helper scripts (profile creation, fixtures with QPainter) run
# under a venv that has aqt + PyQt6 available.
ANKI_VENV_PY="${ANKI_VENV_PY:-$HOME/.local/share/AnkiProgramFiles/.venv/bin/python}"
REAL_ANKI2="${REAL_ANKI2:-$HOME/.local/share/Anki2}"
PROFILE_NAME="AnkiBrain Demo"
ALL_PASSES=(main)
LAUNCH_TIMEOUT="${ANKIBRAIN_DEMO_TIMEOUT:-1200}"

PROBE=0
LIST=0
SKIP_AI=0
ONLY=""
PASSES=()

usage() {
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --probe) PROBE=1; shift ;;
        --list) LIST=1; shift ;;
        --skip-ai) SKIP_AI=1; shift ;;
        --only) ONLY="${2:?--only needs a comma list of shot ids}"; shift 2 ;;
        --only=*) ONLY="${1#--only=}"; shift ;;
        --pass) PASSES+=("${2:?--pass needs a pass name}"); shift 2 ;;
        --pass=*) PASSES+=("${1#--pass=}"); shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
done

if [[ ${#PASSES[@]} -eq 0 ]]; then
    PASSES=("${ALL_PASSES[@]}")
fi

if [[ $LIST -eq 1 ]]; then
    python3 "$DEMO_DIR/preflight.py" --list "$DEMO_DIR/shots.json"
    exit 0
fi

# ── 1. preflight: Anki closed, tooling present ──────────────────────────────
command -v "$ANKI_BIN" >/dev/null 2>&1 || {
    echo "error: '$ANKI_BIN' is not on PATH" >&2; exit 1; }

# A killed run leaves its engine/mpv children behind, and an orphaned Anki
# still owns the single-instance socket: the next launch would connect to it,
# report "Already running; reusing existing instance" and exit without ever
# reaching the capture driver. SIGKILL is deliberate - the add-on installs a
# SIGTERM handler that cannot exit, so a polite signal is not enough.
# Nothing outside this pipeline's base folder is ever touched.
cleanup_stale() {
    if pgrep -f "$BASE_DIR" >/dev/null 2>&1; then
        echo "==> clearing processes left by an earlier aborted run"
        pkill -9 -f "$BASE_DIR" || true
        sleep 2
    fi
}
# ...also on the way out, so a pass that dies never poisons the next run.
trap cleanup_stale EXIT

cleanup_stale
if pgrep -x anki >/dev/null 2>&1; then
    echo "error: Anki is running - close it first (one Anki instance per OS user)" >&2
    pgrep -ax anki >&2 || true
    exit 1
fi
mkdir -p "$OUT_DIR" "$LOG_DIR" "$SHOT_DIR"

# ── 2. stale webview build guard ────────────────────────────────────────────
if [[ -f "$REPO_ROOT/webview/dist/index.html" ]]; then
    if [[ -n "$(find "$REPO_ROOT/webview/src" -newer "$REPO_ROOT/webview/dist/index.html" -print -quit)" ]]; then
        echo "==> webview/dist is stale, running yarn build"
        (cd "$REPO_ROOT/webview" && yarn build)
    fi
else
    echo "==> webview/dist is missing, running yarn build"
    (cd "$REPO_ROOT/webview" && yarn build)
fi

# ── 3. demo base ────────────────────────────────────────────────────────────
build_base() {
    echo "==> building hermetic Anki base at $BASE_DIR"
    rm -rf "$BASE_DIR"
    mkdir -p "$BASE_DIR/addons21"

    rsync -a --delete \
        --exclude 'build/' \
        --exclude '.git/' \
        --exclude '__pycache__/' \
        --exclude 'webview/node_modules/' \
        --exclude 'demo/out/' \
        --exclude 'user_files/local_engine/' \
        --exclude 'user_files/voice/' \
        --exclude 'user_files/db/' \
        --exclude 'user_files/media_tmp/' \
        --exclude 'user_files/card_backups/' \
        --exclude 'user_files/settings.json' \
        --exclude 'user_files/.env' \
        "$REPO_ROOT/" "$BASE_DIR/addons21/AnkiBrain/"

    # The provisioned engines are heavy and hash-pinned to the copied code, so
    # link them in instead of duplicating tens of thousands of files: both
    # engines keep reporting 'supported-and-installed' from the demo base.
    ln -s "$REPO_ROOT/user_files/local_engine" "$BASE_DIR/addons21/AnkiBrain/user_files/local_engine"
    ln -s "$REPO_ROOT/user_files/voice" "$BASE_DIR/addons21/AnkiBrain/user_files/voice"
    # The real API key, in a gitignored directory.
    cp "$REPO_ROOT/user_files/.env" "$BASE_DIR/addons21/AnkiBrain/user_files/.env"

    mkdir -p "$BASE_DIR/addons21/AnkiBrainDemo"
    cp "$DEMO_DIR/addon/"*.py "$BASE_DIR/addons21/AnkiBrainDemo/"

    # A copied prefs21.db carries a real _global meta row (firstRun False,
    # defaultLang set), so Anki boots straight into a profile instead of the
    # first-run language dialog.
    cp "$REAL_ANKI2/prefs21.db" "$BASE_DIR/prefs21.db"
    "$ANKI_VENV_PY" "$DEMO_DIR/preflight.py" --create-profile "$BASE_DIR" "$PROFILE_NAME"
}

# ── 4/5. one pass: settings, launch, wait for the driver ────────────────────

run_pass() {
    local pass="$1"
    echo "==> pass '$pass'"
    rm -f "$LOG_DIR/$pass.done"
    python3 "$DEMO_DIR/preflight.py" --pass "$pass" \
        --repo "$REPO_ROOT" --base "$BASE_DIR" --shots "$DEMO_DIR/shots.json"

    local env_args=(ANKIBRAIN_DEMO_PASS="$pass"
                    ANKIBRAIN_DEMO_ROOT="$DEMO_DIR"
                    ANKIBRAIN_DEMO_OUT="$SHOT_DIR"
                    ANKIBRAIN_DEMO_LOGS="$LOG_DIR"
                    ANKIBRAIN_DEMO_PROFILE="$PROFILE_NAME"
                    QTWEBENGINE_CHROMIUM_FLAGS=--disable-gpu)
    [[ -n "$ONLY" ]] && env_args+=("ANKIBRAIN_DEMO_ONLY=$ONLY")
    [[ $SKIP_AI -eq 1 ]] && env_args+=("ANKIBRAIN_DEMO_SKIP_AI=1")
    [[ $PROBE -eq 1 ]] && env_args+=("ANKIBRAIN_DEMO_PROBE=1" "ANKIBRAIN_DEMO_PROBE_DIR=$OUT_DIR/probe")

    ( cd "$REPO_ROOT" && env "${env_args[@]}" "$ANKI_BIN" -b "$BASE_DIR" -p "$PROFILE_NAME" \
        > "$LOG_DIR/$pass.stdout.log" 2>&1 ) &
    local anki_pid=$!
    echo "    anki pid $anki_pid, waiting for $LOG_DIR/$pass.done (<= ${LAUNCH_TIMEOUT}s)"

    local waited=0
    while [[ ! -f "$LOG_DIR/$pass.done" ]]; do
        if ! kill -0 "$anki_pid" 2>/dev/null; then
            echo "error: Anki exited before writing $pass.done" >&2
            tail -40 "$LOG_DIR/$pass.stdout.log" >&2 || true
            wait "$anki_pid" 2>/dev/null || true
            return 1
        fi
        if (( waited >= LAUNCH_TIMEOUT )); then
            echo "error: pass '$pass' timed out after ${LAUNCH_TIMEOUT}s" >&2
            kill "$anki_pid" 2>/dev/null || true
            return 1
        fi
        sleep 2
        waited=$((waited + 2))
    done
    wait "$anki_pid" 2>/dev/null || true
    echo "    pass '$pass' done"
}

if [[ $PROBE -eq 1 ]]; then
    mkdir -p "$OUT_DIR/probe"
    build_base
    run_pass main
    python3 "$DEMO_DIR/preflight.py" --probe-report "$OUT_DIR/probe" "$DEMO_DIR/config.json"
    exit $?
fi

build_base
"$ANKI_VENV_PY" "$DEMO_DIR/fixtures/build_fixtures.py" "$OUT_DIR/fixtures"

status=0
for pass in "${PASSES[@]}"; do
    run_pass "$pass" || status=1
done

python3 "$DEMO_DIR/preflight.py" --summary "$SHOT_DIR/manifest.json" "$DEMO_DIR/shots.json" || status=1
exit $status
