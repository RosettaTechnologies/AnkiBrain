import shutil
from os import path
from typing import Optional

from aqt import mw

from project_paths import root_project_dir


def add_ankibrain_menu():
    ankibrain_menu = mw.form.menubar.addMenu('AnkiBrain')
    mw.ankibrain_menu = ankibrain_menu


def run_boot_checks():
    """
    Remove the root-level /venv left behind by the pre-1.1 layout (it belongs
    in user_files/, and nothing may hold it open this early in boot).
    :return:
    """
    old_venv_path = path.join(root_project_dir, 'venv')
    if path.isdir(old_venv_path):
        try:
            shutil.rmtree(old_venv_path)
        except Exception as e:
            print(str(e))


def load_ankibrain():
    print('Booting AnkiBrain...')
    run_boot_checks()

    from util import UserMode
    from settings import SettingsManager
    from project_paths import settings_path

    mw.settingsManager = SettingsManager(pth=settings_path)
    user_mode: Optional[UserMode] = mw.settingsManager.get_user_mode()

    # A missing mode is no longer asked about in a Qt dialog: the panel loads
    # and its webview UserModeScreen picks the mode in-process (SET_USER_MODE).
    if user_mode == UserMode.LOCAL:
        print('Loading AnkiBrain in Local Mode...')
    elif user_mode == UserMode.SERVER:
        print('Loading AnkiBrain in Regular (Server) Mode...')
    else:
        print('No user mode chosen yet; the panel will ask.')

    from AnkiBrainModule import AnkiBrain
    mw.ankiBrain = AnkiBrain(user_mode=user_mode)


# TODO: this doesn't actually work, none of the menu items get removed. Method is not being used.
def unload_ankibrain():
    print('Unloading AnkiBrain...')
    if hasattr(mw, 'ankiBrain') and mw.ankiBrain is not None:
        # mw.ankiBrain.sidePanel.close()
        print('Destroying mw AnkiBrain instance...')
        mw.ankiBrain.stop_main()
        mw.ankiBrain = None

    if hasattr(mw, 'settingsManager') and mw.settingsManager is not None:
        print('Destroying mw SettingsManager instance...')
        mw.settingsManager = None

    from AnkiBrainModule import (remove_ankibrain_menu_actions)
    remove_ankibrain_menu_actions()

