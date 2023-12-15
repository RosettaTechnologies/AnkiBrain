1. Open terminal in the AnkiBrain addon root folder (you'll see a `requirements.txt` file)
2. Install C++ build tools for your OS
    1. Windows
        1. Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
        2. Click "Desktop Development with C++" (do not skip this step)
        3. Install
    2. MacOS
       ```xcode-select --install```
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