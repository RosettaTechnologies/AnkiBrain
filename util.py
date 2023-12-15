import json
import platform
import subprocess
from enum import Enum
from os import path

from project_paths import root_project_dir, venv_path

root_dir = root_project_dir


def has_ankibrain_completed_install():
    # Should be /user_files/venv
    # TODO: maybe check for individual dependencies
    return path.isdir(path.join(venv_path))


class UserMode(Enum):
    LOCAL = 'LOCAL'
    SERVER = 'SERVER'


def rewrite_json_file(new_data: dict, f):
    """
    Helper function to rewrite json root object to .json file.
    :param new_data:
    :param f:
    :return:
    """
    f.seek(0)
    json.dump(new_data, f, indent=2, sort_keys=True)
    f.truncate()


def macos_run_script_in_terminal(pth: str, cwd: str = root_dir):
    subprocess.run(['chmod', '+x', pth], cwd=cwd)
    command = f'tell app "Terminal" to do script "source ~/.bashrc; cd \'{cwd}\'; \'{pth}\'"'

    subprocess.run(['osascript', '-e', command])


def linux_run_script_in_terminal(pth: str, cwd: str = root_dir):
    subprocess.run(['chmod', '+x', pth], cwd=cwd)
    subprocess.run(['x-terminal-emulator', '-e', f'bash -c "cd \'{cwd}\'; \'{pth}\'"'])


def run_win_install():
    subprocess.call(path.join(root_dir, 'win-install.bat'))


def run_macos_install():
    macos_run_script_in_terminal(path.join(root_dir, './macos-install.sh'), cwd=root_dir)


def run_linux_install():
    linux_run_script_in_terminal(path.join(root_dir, './linux-install.sh'), cwd=root_dir)


def is_windows():
    return platform.system() == 'Windows'


def is_macos():
    return platform.system() == 'Darwin'


def is_linux():
    return platform.system() == 'Linux'
