VERSION = '0.7.3'

import sys
from os import path

# Necessary to bootstrap this way so we can start importing other modules in the root folder.
sys.path.insert(1, path.abspath(path.dirname(__file__)))

from project_paths import \
    ChatAI_module_dir, \
    version_file_path, \
    venv_site_packages_path, \
    bundled_deps_dor

sys.path.insert(1, ChatAI_module_dir)
sys.path.insert(1, venv_site_packages_path)

# Also insert bundled_dependencies folder for server mode (needs httpx lib).
sys.path.insert(1, bundled_deps_dor)

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
