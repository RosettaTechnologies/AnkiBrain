VERSION = '1.2.0'

import sys
from os import path

# Necessary to bootstrap this way so we can start importing other modules in the root folder.
addon_root_dir = path.abspath(path.dirname(__file__))
sys.path.insert(1, addon_root_dir)

from project_paths import \
    version_file_path, \
    venv_site_packages_path, \
    bundled_deps_dor

sys.path.insert(1, venv_site_packages_path)

# Also insert bundled_dependencies folder for server mode (needs httpx lib).
sys.path.insert(1, bundled_deps_dor)

# Every addon module imports InterprocessCommand by bare name, so a same-named
# copy in ANY directory ahead of ours on sys.path silently wins over the root
# file (the ChatAI subprocess dir used to be inserted here, and its stale
# pre-Voice enum caused the 'has no attribute SYNTHESIZE_SPEECH' boot toast).
# Import it once here — pinning the real file in sys.modules for every later
# flat import — and fail loudly at boot if anything shadows it again, instead
# of surfacing as a cryptic AttributeError from the webview error handler.
import InterprocessCommand as _shared_commands
_expected_enum = path.join(addon_root_dir, 'InterprocessCommand.py')
if path.abspath(_shared_commands.__file__) != _expected_enum:
    raise ImportError(
        'AnkiBrain: InterprocessCommand resolved to %s instead of %s - a stale '
        'copy in another sys.path directory is shadowing the addon\'s own. '
        'Remove the copy or fix the path order in __init__.py.'
        % (_shared_commands.__file__, _expected_enum))
del _shared_commands, _expected_enum

from anki.hooks import addHook
from aqt import mw
from aqt.qt import *

mw.CURRENT_VERSION = VERSION
if path.isfile(version_file_path):
    os.remove(version_file_path)
with open(version_file_path, 'w') as f:
    f.write(mw.CURRENT_VERSION)

from boot import load_ankibrain, add_ankibrain_menu


def handle_anki_boot():
    # This function body gets executed once per boot, so we ensure we don't add duplicate menu buttons.
    add_ankibrain_menu()

    # Keep track of menu actions references, so we can delete them later if we need to.
    mw.menu_actions = []

    # Ignition sequence
    load_ankibrain()


addHook("profileLoaded", handle_anki_boot)
