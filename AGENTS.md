# AGENTS.md

AnkiBrain is an Anki add-on: Python for the Anki side, React for the side-panel UI.
This checkout is the **live addon folder** (`addons21/AnkiBrain`): Python edits take
effect on the next Anki restart, and there is no standalone Python dev server.

## Layout

- Root `*.py` runs inside Anki's process; imports are flat (the root is put on
  `sys.path`). Add new modules as top-level `foo.py` and `from foo import ...`.
- `ChatAI/` is a **separate subprocess** (LOCAL mode only) running in
  `user_files/local_engine/venv` (CPython 3.11, provisioned from
  `local_engine/runtime-manifest.json` + `local_engine/uv.lock` by
  `local_engine/bootstrap.py` — no pyenv, no system Python, no shell
  installers). It speaks line-delimited JSON over stdin/stdout via
  `ExternalScriptManager`. Do not import it from the addon process.
- `local_engine/` is that runtime's lifecycle package, mirroring `voice/`:
  `state.py` (paths, `state.json`, status verdict, uninstall), `bootstrap.py`
  (uv → CPython → venv → `uv sync --frozen` → import/Chroma smoke test),
  plus the pinned `runtime-manifest.json` / `pyproject.toml` / `uv.lock`.
  Test CLI: `python3 -m local_engine.state --status` (JSON verdict) and
  `--uninstall`. The Anki-side adapter is `ChatAIModuleAdapter.py`
  (`status`/`start_install`/`cancel_install_and_wait`/`uninstall_data`/
  `reset_user_data`); the UI is the webview's `LocalEngineSetupModal`.
- `voice/` is the Kokoro TTS engine: stdlib-only bootstrap/state plus a synthesis
  subprocess in its own uv-managed Python 3.11 venv under `user_files/voice`
  (Kokoro needs >=3.10,<3.13, so it cannot share the ChatAI venv). Works in both
  user modes.
- `webview/` is React + Vite + Yarn 4. `SidePanel.py` loads
  `webview/dist/index.html` over `file://`; `dist/` is gitignored, so UI changes
  need `yarn build` and an Anki restart.
- `user_files/` mixes **tracked** vendored libs (`bundled_dependencies/`, used by
  `networking.py` for server mode) with **gitignored** per-user state
  (`settings.json`, `venv/` (legacy), `voice/`, `local_engine/`, `media_tmp/`,
  `db/chroma-persist/`). Settings defaults live in `settings.py`, not in
  `settings.json`.
- The add-on process puts **no** venv site-packages on `sys.path`: the engine
  dependencies are only ever imported inside the `ChatAI/` subprocess. Root
  modules import stdlib + `aqt`/`anki` + `bundled_dependencies/` only.
- `build/` is packaging output and staging copies of old code; never edit or
  search it for source.

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
- LOCAL-mode engine lifecycle is `LOCAL_ENGINE_STATUS` / `LOCAL_ENGINE_INSTALL` /
  `LOCAL_ENGINE_CANCEL_INSTALL` / `LOCAL_ENGINE_UNINSTALL` /
  `LOCAL_ENGINE_RESET_DATA`; install progress arrives as pushed
  `LOCAL_ENGINE_INSTALL_PROGRESS` + `LOCAL_ENGINE_INSTALL_DONE` events, and the
  three Python-initiated pushes `localEngineSetupRequired`,
  `localEngineUninstallPrompt`, `localEngineStartFailed` open/populate the modal.
- Qt/UI work from async or worker threads must go through `GUIThreadSignaler`
  (`AnkiBrainModule.py`); `ReactBridge.send_to_js` is the safe path.

## Gotchas

- media_tmp is bytes-free across the bridge: JS only ever sees image/audio ids
  (`run-id/filename`). `media_images.cleanup_media_tmp` deletes entries older than
  7 days at startup.
- New settings keys go in `settings.py` `default_settings`; they are merged into
  `user_files/settings.json` on boot and sent to the webview via
  `DID_LOAD_SETTINGS`.
- LOCAL mode = ChatAI subprocess + engine runtime under `user_files/local_engine/`
  + OpenAI key in `user_files/.env`. SERVER mode = account API at
  `https://anki.rankmd.org` (dev URL when `devMode` is on; see
  `webview/src/api/server-api/networking/index.js`). Voice works in both.
- A LOCAL-mode engine failure must never strand the UI: the subprocess start is
  bounded by `ExternalScriptManager.startup_timeout` (120 s for ChatAI) and
  `_start_async_members` sends `DID_FINISH_STARTUP` from a `finally`. Failures
  land in `user_files/local_engine/state.json` as `last_error` (codes `start` /
  `runtime`) and surface as the Settings banner + Repair button. `last_error` is
  deliberately NOT part of the hash-based status verdict, so a crash can never
  look like manifest drift and silently auto-repair.
- `voice/runtime-manifest.json`/`uv.lock` and
  `local_engine/runtime-manifest.json`/`uv.lock` are hashed into each install's
  `state.json`; editing either pair marks installed engines `needs-sync` and
  forces a re-download for users. Touch only when intentionally updating the
  engine.
- Anki note types `AnkiBrain-Basic` / `AnkiBrain-Cloze` are created on demand in
  `cards.py`; image-occlusion cards use Anki's built-in notetype.
- Vite must keep `base: './'` (QtWebEngine loads from `file://`); env vars must be
  `VITE_`-prefixed (`import.meta.env`).
- Feature work happens on version-prefixed branches (e.g.
  `1.1.0-auto-image-occlusion`); `main` is the release line. A release bumps
  `VERSION` in `__init__.py` and adds a `changelog.md` section.
