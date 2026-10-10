"""
AnkiBrain LOCAL-mode engine runtime package.

The ChatAI subprocess (`ChatAI/`) used to run inside a pyenv-built CPython 3.9
venv created by OS shell installers; that path is gone. This package provisions
the identical lifecycle the Voice engine already has — detect, install, repair,
cancel, uninstall — into one self-contained data tree under
`user_files/local_engine/`, driven by `runtime-manifest.json` + `uv.lock`:

    state.py        paths, state.json, status verdict, uninstall
    bootstrap.py    the uv / CPython / venv / packages / verify pipeline
"""
