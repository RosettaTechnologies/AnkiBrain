# AnkiBrain

See [AnkiBrain](https://ankiweb.net/shared/info/1915225457) on AnkiWeb for more information.

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

## Ollama Setup

> [!CAUTION]
> You will need a powerful enough GPU to run models that produce high-quality cards and topic explanations.


1. Assure that you have Ollama up and running on your system by running `ollama -v`.
2. Confirm the server url of `ollama serve`
   - Default is `http://127.0.0.1:11434`
   - Change this in AnkiBrain under `Set Ollama Host`
3. Assure any models you'd like to use are pulled and available when running `ollama list`.
4. Open AnkiBrain and go to `Settings` in the WebView and then `Advanced Settings`. Change the Provider to `Ollama`.
5. Select the model you would like to use.