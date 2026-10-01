#!/bin/bash

# Automatic local-mode installer for AnkiBrain (Linux).
#
# Installs pyenv, builds the latest CPython 3.9.x that the addon's pinned
# requirements target, and creates ./user_files/venv from that interpreter.
# AnkiBrain's "Run Ubuntu/Debian Installer" button opens this script in a
# terminal; you can also run it from one directly. The terminal stays open
# after the script ends so output remains readable.

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")" || {
    echo "INSTALL FAILED: cannot enter the AnkiBrain folder."
    exit 1
}

fail() {
    echo
    echo "INSTALL FAILED: $*"
    echo
    echo "This window is staying open so you can inspect the error."
    exit 1
}

echo "=============================================="
echo " AnkiBrain local mode installation"
echo "=============================================="

# ------------------------------------------------- core build dependencies --
chmod +x ./linux-sudo-install-core-deps.sh
if ! ./linux-sudo-install-core-deps.sh; then
    echo "WARNING: core system dependencies could not be installed automatically."
    echo "Attempting to continue; the Python build may fail if build tools are missing."
fi

# ------------------------------------------------------------------ pyenv --
export PYENV_ROOT="$HOME/.pyenv"

if ! command -v pyenv >/dev/null 2>&1 && [ ! -x "$PYENV_ROOT/bin/pyenv" ]; then
    echo "Installing pyenv..."
    curl -fsSL https://pyenv.run | bash || fail "could not install pyenv from https://pyenv.run"
fi

# Do not rely on sourcing ~/.bashrc to activate pyenv: on Ubuntu the default
# ~/.bashrc exits immediately for non-interactive shells, which left pyenv
# off PATH here. Set it inline instead.
export PATH="$PYENV_ROOT/bin:$PATH"
command -v pyenv >/dev/null 2>&1 || fail "pyenv was installed but could not be run"

# Register pyenv for interactive shells, without duplicating lines on reruns.
for rc_file in "$HOME/.bashrc" "$HOME/.profile"; do
    if ! grep -q 'PYENV_ROOT' "$rc_file" 2>/dev/null; then
        {
            echo 'export PYENV_ROOT="$HOME/.pyenv"'
            echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"'
            echo 'eval "$(pyenv init -)"'
        } >> "$rc_file"
    fi
done

# ---------------------------------------------------------- python version --
# The addon expects the venv minor version to be 3.9: project_paths.py pins
# site-packages to lib/python3.9 and linux_requirements.txt is the cp39 wheel
# set. Prefer pyenv's newest 3.9 patch release — 3.9.13 and older fail to
# compile on gcc >= 14, which made implicit function declarations hard errors.
PYVER="$(pyenv install --list \
    | sed -n 's/^[[:space:]]*\(3\.9\.[0-9][0-9]*\)[[:space:]]*$/\1/p' \
    | sort -t. -k3,3n | tail -n 1)"
[ -n "$PYVER" ] || PYVER="3.9.23"

PYBIN="$PYENV_ROOT/versions/$PYVER/bin/python"

if [ ! -x "$PYBIN" ]; then
    # A previous interrupted run can leave the version folder without a usable
    # interpreter; pyenv refuses to overwrite it, so clear it first.
    if [ -d "$PYENV_ROOT/versions/$PYVER" ]; then
        echo "Removing incomplete Python $PYVER installation..."
        rm -rf "$PYENV_ROOT/versions/$PYVER"
    fi
    echo "Building Python $PYVER with pyenv (this can take several minutes)..."
    if ! pyenv install "$PYVER"; then
        echo "First build attempt failed; retrying with gcc-14+ compatibility flags..."
        if ! CFLAGS='-Wno-error=implicit-function-declaration' pyenv install "$PYVER"; then
            fail "could not build Python $PYVER on this system. See the pyenv build log above for the compiler error."
        fi
    fi
fi

[ -x "$PYBIN" ] || fail "pyenv reports $PYVER installed but $PYBIN is missing"

"$PYBIN" -c 'import ssl' \
    || fail "Python $PYVER was built without the ssl module (is libssl-dev installed?)"

# ------------------------------------------------------------------- venv --
venv_dir="./user_files/venv"
if [ -d "$venv_dir" ]; then
    echo "$venv_dir exists. Deleting it..."
    rm -rf "$venv_dir"
fi

echo "Creating the virtualenv with Python $PYVER..."
"$PYBIN" -m venv "$venv_dir" || fail "could not create $venv_dir"

VPY="$venv_dir/bin/python"

echo "Upgrading pip..."
"$VPY" -m pip install --upgrade pip || echo "WARNING: pip upgrade failed; continuing with the bundled pip."

echo "Installing dependencies from linux_requirements.txt (this can take a while)..."
"$VPY" -m pip install -r linux_requirements.txt \
    || fail "pip install failed. See the pip output above."

echo
echo "=================================================================="
echo " AnkiBrain local mode dependencies are installed."
echo " Close this window, then restart Anki."
echo "=================================================================="
