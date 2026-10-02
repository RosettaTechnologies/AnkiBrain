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

# Local Mode Installation (manual install)

## Remarks
### Linux
Please notice that this addon doesn't work when Anki is installed as a Flatpak.
To resolve this, simply install Anki from the official website using the .deb package.

## Installation steps

1. Open terminal in the AnkiBrain addon root folder (you'll see a `requirements.txt` file)
2. Install C++ build tools for your OS

   1. Windows
      1. Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
      2. Click "Desktop Development with C++" (do not skip this step)
      3. Install
   2. MacOS
      `xcode-select --install`
   3. Linux

   ```
    sudo apt install -y git build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev curl libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev
   ```

3. Setup Python 3.9.13 virtual environment in the root addon directory

   1. Install `pyenv` for your operating system

      1. Windows, using powershell (original
         guide [here](https://github.com/pyenv-win/pyenv-win/blob/master/docs/installation.md#powershell))

      ```powershell
      Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/pyenv-win/pyenv-win/master/pyenv-win/install-pyenv-win.ps1" -OutFile "./install-pyenv-win.ps1"; &"./install-pyenv-win.ps1"
      $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
      ```

      2. MacOS

         ```shell
         # Install homebrew
         /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

         brew update
         brew install pyenv
         echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.zshrc
         echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.zshrc
         echo 'eval "$(pyenv init -)"' >> ~/.zshrc
         exec "$SHELL"
         ```

      3. Linux

      ```
      curl https://pyenv.run | bash

      echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc
      echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc
      echo 'eval "$(pyenv init -)"' >> ~/.bashrc
      echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.profile
      echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.profile
      echo 'eval "$(pyenv init -)"' >> ~/.profile

      . ~/.bashrc
      . ~/.profile
      ```

   2. `pyenv install 3.9.13`
   3. `pyenv local 3.9.13`
   4. `python -m venv venv`

4. Activate Python virtual environment
   1. Windows: `.\venv\Scripts\active`
   2. MacOS/Linux: `./venv/bin/activate`
5. Install python dependencies
   1. `pip install -r requirements.txt`
   2. Should produce no errors
6. Addon should be OK to run now
