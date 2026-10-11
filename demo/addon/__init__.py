"""
Demo harness add-on.

Loaded into a hermetic Anki base by demo/run.sh. When ANKIBRAIN_DEMO_PASS is
set it starts the capture driver once the add-on under test has finished
loading its panel. Without that variable this add-on does nothing at all, so it
is inert in any base folder that happens to contain it.
"""

import os

_PASS = os.environ.get('ANKIBRAIN_DEMO_PASS') or ''

if _PASS:
    from aqt import gui_hooks

    from .driver import start

    def _on_profile_open():
        print('[demo] profile opened; starting the capture driver', flush=True)
        start()

    gui_hooks.profile_did_open.append(_on_profile_open)
