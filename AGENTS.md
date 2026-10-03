# AGENTS.md

AnkiBrain is an Anki add-on: Python for the Anki side, React for the side-panel UI.
This checkout is the **live addon folder** (`addons21/AnkiBrain`): Python edits take
effect on the next Anki restart, and there is no standalone Python dev server.

## Layout

- Root `*.py` runs inside Anki's process; imports are flat (the root is put on
  `sys.path`). Add new modules as top-level `foo.py` and `from foo import ...`.
- `ChatAI/` is a **separate subprocess** (LOCAL mode only) running in
  `user_files/venv` (Python 3.9, hardcoded in `project_paths.py`). It speaks
  line-delimited JSON over stdin/stdout via `ExternalScriptManager`. Do not
  import it from the addon process.
- `voice/` is the Kokoro TTS engine: stdlib-only bootstrap/state plus a synthesis
  subprocess in its own uv-managed Python 3.11 venv under `user_files/voice`
  (Kokoro needs >=3.10,<3.13, so it cannot share the ChatAI venv). Works in both
  user modes.
- `webview/` is React + Vite + Yarn 4. `SidePanel.py` loads
  `webview/dist/index.html` over `file://`; `dist/` is gitignored, so UI changes
  need `yarn build` and an Anki restart.
- `user_files/` mixes **tracked** vendored libs (`bundled_dependencies/`, used by
  `networking.py` for server mode) with **gitignored** per-user state
  (`settings.json`, `venv/`, `voice/`, `media_tmp/`, `db/chroma-persist/`).
  Settings defaults live in `settings.py`, not in `settings.json`.
- `build/` is packaging output and staging copies of old code; never edit or
  search it for source.
- Installers: `linux-install.sh`, `macos-install.sh`, `win-*.{bat,ps1}` plus
  `linux_requirements.txt` / `windows_requirements.txt`. There is **no** root
  `requirements.txt` even though the README says so; `macos-install.sh` installs
  `linux_requirements.txt`.

## Commands

Webview (inside `webview/`; Yarn 4 is pinned via `packageManager` — run
`corepack enable` if `yarn` is missing; `yarn install` on a fresh clone):

- `yarn dev` — standalone UI at localhost:3000. `VITE_APP_ENV=STANDALONE` makes
  every Python bridge call a no-op, so it previews UI only.
- `yarn test` / `yarn test:watch` — Vitest + jsdom. Single file:
  `yarn vitest run src/Components/modals/VoiceSetupModal.test.jsx`.
- `yarn lint` — flat ESLint config; legacy JS gets parser/globals only, unused
  vars are warnings.
- `yarn build` — required for Anki to see UI changes.

Packaging: `./package-addon.sh` (needs yarn/corepack, zip, rsync) builds the
webview and writes `build/AnkiBrain-<version>.ankiaddon`. It reads the version
via sed from `VERSION = '...'` in `__init__.py` — keep that exact format. Release
notes go in `changelog.md`.

No Python tests and no CI: validate Python by restarting Anki and watching stdout
(launch Anki from a terminal to see `print()` output). The menu's "Restart AI..."
only restarts the ChatAI/TTS subprocesses, not addon Python or the loaded UI.

## Bridge contracts (easy to break)

- `InterprocessCommand.py` and `webview/src/api/PythonBridge/InterprocessCommand.js`
  are duplicate enums — update both. `__init__.py` fails loudly at boot if a stale
  copy shadows the root file.
- JS -> Python is `console.log('DATA_FROM_REACT: ' + JSON.stringify(...))`,
  intercepted by `WebEnginePage.javaScriptConsoleMessage`. Never emit that prefix
  for debug logs.
- Python -> JS is `window.receiveFromPython(payload)`; the command switchboard is
  `webview/src/api/PythonBridge/index.js`.
- One Python command runs at a time: `sendPythonCommand` takes a global
  `pyCommandLock`, released by `DID_*` replies. Async flows use
  `asendPythonCommand` + `commandId` promises.
- `ChatAI/` and the voice engine own stdout — protocol JSON only; debug output
  goes to stderr (drained to a log by `ExternalScriptManager`).
- Qt/UI work from async or worker threads must go through `GUIThreadSignaler`
  (`AnkiBrainModule.py`); `ReactBridge.send_to_js` is the safe path.

## Gotchas

- `ChatAI/__pycache__/*.pyc` is (mistakenly) tracked; running the subprocess
  modifies it. Don't stage `.pyc` noise.
- media_tmp is bytes-free across the bridge: JS only ever sees image/audio ids
  (`run-id/filename`). `media_images.cleanup_media_tmp` deletes entries older than
  7 days at startup.
- New settings keys go in `settings.py` `default_settings`; they are merged into
  `user_files/settings.json` on boot and sent to the webview via
  `DID_LOAD_SETTINGS`.
- LOCAL mode = ChatAI subprocess + OpenAI key in `user_files/.env`. SERVER mode =
  account API at `https://anki.rankmd.org` (dev URL when `devMode` is on; see
  `webview/src/api/server-api/networking/index.js`). Voice works in both.
- `voice/runtime-manifest.json` and `voice/uv.lock` are hashed into each install's
  `state.json`; editing either marks installed engines `needs-sync` and forces a
  re-download for users. Touch only when intentionally updating the engine.
- Anki note types `AnkiBrain-Basic` / `AnkiBrain-Cloze` are created on demand in
  `cards.py`; image-occlusion cards use Anki's built-in notetype.
- Vite must keep `base: './'` (QtWebEngine loads from `file://`); env vars must be
  `VITE_`-prefixed (`import.meta.env`).
- Feature work happens on version-prefixed branches (e.g.
  `1.1.0-auto-image-occlusion`); `main` is the release line. A release bumps
  `VERSION` in `__init__.py` and adds a `changelog.md` section.
