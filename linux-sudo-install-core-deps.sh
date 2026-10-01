#!/bin/bash

# Core build dependencies for the pyenv-compiled Python that AnkiBrain's
# local mode uses (Ubuntu/Debian). Invoked by linux-install.sh.
#
# Each package is installed separately: names get renamed as Ubuntu evolves
# (libncursesw5-dev became libncurses-dev in 24.04), and a single unknown
# name would otherwise abort `apt install` for the whole batch.

set -u

if ! command -v apt-get >/dev/null 2>&1; then
    echo "WARNING: apt-get not found. This helper only supports Debian/Ubuntu."
    echo "Install your distro's Python build dependencies, then re-run linux-install.sh."
    exit 1
fi

sudo apt-get update

PACKAGES=(
    git build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev
    libsqlite3-dev curl libncurses-dev xz-utils tk-dev libxml2-dev
    libxmlsec1-dev libffi-dev liblzma-dev
)

missing=()
for pkg in "${PACKAGES[@]}"; do
    if ! sudo apt-get install -y "$pkg"; then
        echo "WARNING: could not install '$pkg', continuing."
        missing+=("$pkg")
    fi
done

# Older releases (<= 22.04) still ship the pre-rename ncurses package; use it
# when the new name is unavailable there.
for pkg in "${missing[@]+"${missing[@]}"}"; do
    if [ "$pkg" = "libncurses-dev" ] && sudo apt-get install -y libncursesw5-dev; then
        echo "Installed libncursesw5-dev instead of libncurses-dev."
    fi
done

exit 0
