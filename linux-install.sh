#!/bin/bash

chmod +x ./linux-sudo-install-core-deps.sh
sudo ./linux-sudo-install-core-deps.sh

if command -v pyenv 1>/dev/null 2>&1; then
  echo "pyenv is installed"
else
  # Install pyenv
  curl https://pyenv.run | bash

  # Add pyenv to bash so it starts automatically
  echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc
  echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc
  echo 'eval "$(pyenv init -)"' >> ~/.bashrc

  echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.profile
  echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.profile
  echo 'eval "$(pyenv init -)"' >> ~/.profile

  # Source bashrc to reflect the changes in the current session
  . ~/.bashrc
  . ~/.profile
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
pip install -r linux_requirements.txt

deactivate
