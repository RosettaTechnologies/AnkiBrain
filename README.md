# AnkiBrain

See [AnkiBrain](https://ankiweb.net/shared/info/1915225457) on AnkiWeb for more information.

# AnkiBrain Voice (Kokoro TTS)

Fully local text-to-speech, available in **both Regular (server) and Local mode** — the
engine never talks to any server after setup. Highlight text on a card and press
**Speak**, hit the speaker icon on any chat reply, or let generated cards embed
`[sound:]` audio automatically.

**First use:** press any speak control (or Settings → Voice → *Install voice engine*).
AnkiBrain downloads a pinned, checksum-verified runtime (~700 MB download / ~1.6 GB
disk): the `uv` package manager, a standalone CPython 3.11, the Kokoro-82M model +
voices, and `voice/uv.lock`'s exact dependency set — all into `user_files/voice/`.
No admin rights, no pyenv, no system Python involved, one progress bar with
cancel/retry, and repairs re-use the local cache.

- Languages built in: English (US/GB), Spanish, French, Hindi, Italian, Portuguese,
  Chinese. Japanese is an optional pack (needs cmake + a C/C++ compiler to build
  `pyopenjtalk` unless prebuilt wheels are available in the wheelhouse referenced by
  `voice/runtime-manifest.json`).
- **Automatic language detection (on by default):** each text is spoken with a
  voice for its detected language (Spanish text → Spanish voice, and so on).
  The voice selected in Settings is the fallback when the language can't be
  detected or its pack isn't installed; toggle it in Settings → Voice.
- Requirements: Windows 10+, macOS 12+ on **Apple Silicon** (PyTorch no longer ships
  Intel-mac wheels), Linux x86_64/aarch64. Windows boxes with long-path support
  disabled auto-relocate the engine to `%LOCALAPPDATA%\AnkiBrain\voice`.
- Air-gapped networks: mirrors work via standard env vars (`UV_PYTHON_INSTALL_MIRROR`,
  `HF_ENDPOINT`, `UV_DEFAULT_INDEX`/`PIP_INDEX_URL`) inherited from the Anki process.
- Everything lives under `user_files/` (survives add-on updates); delete that folder's
  `voice/` dir to uninstall. The engine spawns lazily and unloads after 15 idle
  minutes to free RAM.

# Local Mode Installation

Local mode runs the ChatAI engine inside a self-contained runtime that AnkiBrain
provisions itself: no admin rights, no pyenv, no system Python, no shell scripts
and no C++ build tools.

## Setup

1. Settings -> **Local AI Engine** -> **Install engine** (or the
   **AnkiBrain -> Local AI Engine: Install/Repair...** menu item).
2. AnkiBrain downloads a pinned, checksum-verified runtime (~380 MB download /
   ~1.1 GB disk): the `uv` package manager, a standalone CPython 3.11, and
   `local_engine/uv.lock`'s exact dependency set - all into
   `user_files/local_engine/`. One progress bar with cancel/retry, and a repair
   re-uses the local cache and takes seconds.
3. Set your OpenAI API key (Settings -> Local AI Engine -> *Set OpenAI API Key...*).

- Requirements: Windows 10+, macOS 12+ on **Apple Silicon** (a locked dependency
  publishes no Intel-mac wheels), Linux x86_64/aarch64. Windows boxes with
  long-path support disabled auto-relocate the engine to
  `%LOCALAPPDATA%\AnkiBrain\local_engine`.
- Air-gapped networks: mirrors work via the standard env vars (`UV_DEFAULT_INDEX` /
  `PIP_INDEX_URL`, `UV_PYTHON_INSTALL_MIRROR`) inherited from the Anki process, and
  a pre-seeded `user_files/local_engine/cache/` is reused instead of re-downloaded.
- **Repair engine** rebuilds the runtime from the lock and leaves your documents
  alone; **Uninstall** removes the engine runtime only; **Reset documents & data**
  separately deletes the vector store, the imported-document cache, temp files and
  the saved OpenAI key.
- Everything lives under `user_files/local_engine/` and survives add-on updates.
- Status and teardown from a terminal: `python3 -m local_engine.state --status`
  (and `--uninstall`).

## Remarks

### Linux
Please notice that this addon doesn't work when Anki is installed as a Flatpak.
To resolve this, simply install Anki from the official website using the .deb package.
