#!/usr/bin/env bash
# Build a distributable AnkiBrain-<version>.ankiaddon for AnkiWeb upload.
#
# The archive root contains __init__.py directly (no nested top-level folder);
# AnkiWeb rejects packages with __pycache__. The webview contributes only its
# build output (webview/dist) to keep the archive small (dist ~2MB vs node_modules
# ~370MB in the working tree).
#
# Excludes are safe because:
#   - user_files/settings.json  -> recreated on first boot by settings.py
#   - .ankibrain-version        -> rewritten by __init__.py on every Anki load
#   - meta.json                 -> Anki-local state (disable flags etc.)
#   - user_files/venv/, .env    -> per-user runtime data
#   - user_files/voice/         -> Kokoro runtime (uv/python/venv/hf_cache, ~2GB)
#   - user_files/media_tmp/     -> per-user image + TTS audio temp store
#   - install scripts / requirements stay IN: util.py invokes them at runtime.
#   - voice/ (manifest, lock, bootstrap, engine scripts) stay IN: ~300KB, the
#     pinned source the runtime is rebuilt from.
# Anki's installer preserves existing user_files/ across add-on updates.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SRC_DIR/build"                 # already in .gitignore
STAGE_DIR="$BUILD_DIR/AnkiBrain"
VERSION="$(sed -n "s/^VERSION = '\([^']*\)'/\1/p" "$SRC_DIR/__init__.py")"
OUT="$BUILD_DIR/AnkiBrain-$VERSION.ankiaddon"

die() { echo "ERROR: $*" >&2; exit 1; }
[ -n "$VERSION" ] || die "Could not read VERSION from __init__.py"
command -v zip   >/dev/null || die "zip is required"
command -v rsync >/dev/null || die "rsync is required"

# The webview pins Yarn 4 via packageManager; prefer corepack over any global yarn.
if command -v corepack >/dev/null 2>&1; then
  YARN=(corepack yarn)
elif command -v yarn >/dev/null 2>&1; then
  YARN=(yarn)
else
  die "yarn is required to build the webview"
fi

# 1. Build the webview (Vite cleans dist/ itself)
echo "==> ${YARN[*]} build (webview)"
(cd "$SRC_DIR/webview" && "${YARN[@]}" build)
[ -f "$SRC_DIR/webview/dist/index.html" ] || die "webview build produced no dist/index.html"

# 2. Stage: everything except junk; webview contributes only dist/
echo "==> staging into $STAGE_DIR"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
rsync -a \
  --exclude '.git/' --exclude '.idea/' --exclude '.github/' \
  --exclude 'node_modules/' --exclude '.yarn/' \
  --exclude '__pycache__/' --exclude '*.pyc' --exclude '*.pyo' \
  --exclude '.DS_Store' --exclude '.gitignore' \
  --exclude 'build/' --exclude '*.ankiaddon' \
  --exclude 'package-addon.sh' \
  --exclude 'webview/' \
  --exclude 'user_files/settings.json' --exclude 'user_files/.env' \
  --exclude 'user_files/venv/' --exclude 'user_files/voice/' \
  --exclude 'user_files/media_tmp/' \
  --exclude 'meta.json' --exclude '.ankibrain-version' \
  "$SRC_DIR/" "$STAGE_DIR/"
mkdir -p "$STAGE_DIR/webview"
rsync -a "$SRC_DIR/webview/dist/" "$STAGE_DIR/webview/dist/"

# 3. Safety sweep: caches can be nested anywhere (AnkiWeb rejects __pycache__)
find "$STAGE_DIR" -type d -name '__pycache__' -prune -exec rm -rf {} +
find "$STAGE_DIR" -type f \( -name '*.pyc' -o -name '*.pyo' -o -name '.DS_Store' \) -delete

# 4. manifest.json -- not needed by AnkiWeb, but lets the same file install via
#    Anki's "Install Add-on From File" (required keys: package + name)
cat > "$STAGE_DIR/manifest.json" <<EOF
{
  "package": "AnkiBrain",
  "name": "AnkiBrain",
  "human_version": "$VERSION",
  "mod": $(date +%s)
}
EOF

# 5. Zip with contents at the archive root (official Anki docs pattern).
#    Staging has no dotfiles, so * catches everything.
echo "==> creating $OUT"
rm -f "$OUT"
( cd "$STAGE_DIR" && zip -r -X -q "$OUT" ./* )

# 6. Verify nothing junky or personal slipped through
#    (capture listing first: grep -q early-exit + pipefail would SIGPIPE unzip)
LISTING="$(unzip -l "$OUT")"
if printf '%s\n' "$LISTING" | grep -Eq '__pycache__|\.pyc|node_modules|settings\.json|meta\.json|user_files/(voice|media_tmp|venv)/|webview/(src|public|\.yarn|node_modules)'; then
  die "junk detected in archive: $OUT"
fi
printf '%s\n' "$LISTING" | grep -Eq ' __init__.py$' || die "__init__.py missing from archive root: $OUT"
echo "==> OK: $OUT ($(du -h "$OUT" | cut -f1))"
echo "==> Top-level entries:"
printf '%s\n' "$LISTING" | awk 'NR>3 && NF>=4 && $4 ~ /^[^/]+\/?$/ { print "    " $4 }'
