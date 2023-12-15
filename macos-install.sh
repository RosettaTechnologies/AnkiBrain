#!/bin/bash

xcode-select --install

if ! command -v brew &>/dev/null; then
  echo "Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
else
  echo "Homebrew already installed."
fi

if command -v pyenv 1>/dev/null 2>&1; then
  echo "pyenv is installed"
else
  brew update
  brew install xz
  brew install pyenv

  echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc
  echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc
  echo 'eval "$(pyenv init -)"' >> ~/.bashrc

  echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.profile
  echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.profile
  echo 'eval "$(pyenv init -)"' >> ~/.profile

  # Just in case
  echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.zshrc
  echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.zshrc
  echo 'eval "$(pyenv init -)"' >> ~/.zshrc

  source ~/.bashrc
  #source ~/.profile
  #source ~/.zshrc
fi

pyenv install 3.9.13
pyenv local 3.9.13

venv_dir="./user_files/venv"
if [ -d "$venv_dir" ]; then
    echo "$venv_dir exists. Deleting it..."
    rm -rf "$venv_dir"
fi

python -m venv ./user_files/venv
. ./user_files/venv/bin/activate
pip install -r ./linux_requirements.txt

deactivate