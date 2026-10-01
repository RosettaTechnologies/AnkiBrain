import json
import os
import platform
import shlex
import shutil
import subprocess
from enum import Enum
from os import path

from project_paths import (
    python_path,
    root_project_dir,
    venv_path,
    venv_site_packages_path,
)

root_dir = root_project_dir


def has_ankibrain_completed_install():
    # Should be /user_files/venv. Check the interpreter and the site-packages
    # directory the addon puts on sys.path, not just the folder: an interrupted
    # install or a venv built with the wrong Python version must re-trigger the
    # installer instead of half-booting into the AI engine.
    return (
        path.isdir(venv_path)
        and path.isfile(python_path)
        and path.isdir(venv_site_packages_path)
    )


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


# Terminals are grouped by how they accept a command line:
#   dash-dash    : `term -- bash -c <cmd>`        (GNOME-family, includes ptyxis)
#   exec-argv    : `term -e bash -c <cmd>`        (rest of argv becomes the command)
#   exec-string  : `term -e '<command string>'`   (string is re-parsed by the term)
_LINUX_DASH_DASH_TERMS = ['ptyxis', 'gnome-terminal', 'mate-terminal']
_LINUX_EXEC_ARGV_TERMS = ['konsole', 'xterm', 'qterminal']
_LINUX_EXEC_STRING_TERMS = ['xfce4-terminal']


def _spawn_terminal(args: list) -> bool:
    """
    Launch a terminal command and decide quickly whether it actually opened.
    DBus-activating terminals (ptyxis, gnome-terminal) exit 0 right away once
    the window is handed to their server; terminals that own their window keep
    running. A terminal that fails option parsing exits non-zero within a
    second or so, and the caller moves on to the next candidate.
    """
    try:
        proc = subprocess.Popen(args)
    except OSError:
        return False
    try:
        ret = proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        # Still running after 3s: the window is up and owns the session.
        return True
    return ret == 0


def linux_run_script_in_terminal(pth: str, cwd: str = root_dir) -> bool:
    """
    Open a visible terminal window running the given script, returning True
    when a terminal was launched.

    There is no single portable flag for this. Ubuntu's x-terminal-emulator
    used to mean xterm/gnome-terminal (which accept -e or --), but newer
    Ubuntu ships ptyxis, whose only options are -x and --; passing -e to it
    silently does nothing. So each candidate terminal is asked with its own
    calling convention, and the command is passed as separate argv entries
    (`bash -c <string>`) instead of nested quote soup. The trailing
    `exec bash` keeps the window open after the script exits so errors stay
    readable instead of the window vanishing on a non-zero exit.
    """
    subprocess.run(['chmod', '+x', pth], cwd=cwd)

    shell_cmd = f'cd {shlex.quote(cwd)} && {shlex.quote(pth)}; exec bash'
    bash_args = ['bash', '-c', shell_cmd]

    names = []
    env_term = os.environ.get('TERMINAL')
    if env_term:
        names.append(env_term)
    names.extend(
        _LINUX_DASH_DASH_TERMS + _LINUX_EXEC_ARGV_TERMS + _LINUX_EXEC_STRING_TERMS
    )

    candidates = []
    for name in dict.fromkeys(names):
        resolved = shutil.which(name)
        if resolved is None:
            continue
        if name in _LINUX_DASH_DASH_TERMS:
            candidates.append([resolved, '--'] + bash_args)
        elif name in _LINUX_EXEC_ARGV_TERMS:
            candidates.append([resolved, '-e'] + bash_args)
        else:
            candidates.append([resolved, '-e', shlex.join(bash_args)])

    # Last resort: whatever the distro registered as the default terminal,
    # trying each calling convention in turn.
    if shutil.which('x-terminal-emulator') is not None:
        candidates.append(['x-terminal-emulator', '--'] + bash_args)
        candidates.append(['x-terminal-emulator', '-e'] + bash_args)
        candidates.append(['x-terminal-emulator', '-e', shlex.join(bash_args)])

    for args in candidates:
        if _spawn_terminal(args):
            return True
    return False


def run_win_install():
    subprocess.call(path.join(root_dir, 'win-install.bat'))


def run_macos_install():
    macos_run_script_in_terminal(path.join(root_dir, './macos-install.sh'), cwd=root_dir)


def run_linux_install() -> bool:
    return linux_run_script_in_terminal(path.join(root_dir, './linux-install.sh'), cwd=root_dir)


def is_windows():
    return platform.system() == 'Windows'


def is_macos():
    return platform.system() == 'Darwin'


def is_linux():
    return platform.system() == 'Linux'
