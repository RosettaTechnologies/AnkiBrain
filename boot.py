import shutil
from os import path

from aqt import mw
from aqt.utils import showInfo

from project_paths import root_project_dir


def add_ankibrain_menu():
    ankibrain_menu = mw.form.menubar.addMenu('AnkiBrain')
    mw.ankibrain_menu = ankibrain_menu


def run_boot_checks():
    """
    Check for python dependencies in user_files/venv
    TODO: check if installed dependencies match requirements.txt
    :return:
    """
    # Delete /venv, it should be in /user_files/venv. This should work since the ChatAI module
    # has not powered on, so venv is not being used.
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
    user_mode: UserMode = mw.settingsManager.get_user_mode()

    if user_mode == UserMode.LOCAL:
        load_ankibrain_local_mode()
    elif user_mode == UserMode.SERVER:
        load_ankibrain_server_mode()
    else:
        # No mode set, ask the user.
        from UserModeDialog import show_user_mode_dialog
        show_user_mode_dialog()


def load_ankibrain_local_mode():
    print('Loading AnkiBrain in Local Mode...')
    from util import has_ankibrain_completed_install, UserMode
    from InstallDialog import InstallDialog, show_install_dialog

    if has_ankibrain_completed_install():
        from AnkiBrainModule import AnkiBrain
        ankiBrain = AnkiBrain(user_mode=UserMode.LOCAL)
        mw.ankiBrain = ankiBrain
    else:
        mw.installDialog = InstallDialog(mw)
        mw.installDialog.hide()

        from AnkiBrainModule import add_ankibrain_menu_item
        add_ankibrain_menu_item('Install...', show_install_dialog)

        def show_user_mode_dialog():
            from UserModeDialog import UserModeDialog
            from aqt import mw
            mw.userModeDialog = UserModeDialog()
            mw.userModeDialog.show()

        add_ankibrain_menu_item('Switch User Mode...', show_user_mode_dialog)


def load_ankibrain_server_mode():
    print('Loading AnkiBrain in Regular (Server) Mode...')
    from AnkiBrainModule import AnkiBrain
    from util import UserMode
    mw.ankiBrain = AnkiBrain(user_mode=UserMode.SERVER)


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


def reload_ankibrain():
    showInfo('Please restart Anki to allow AnkiBrain to update.')
