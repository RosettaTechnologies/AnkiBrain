import json
import platform
from enum import Enum


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


def is_windows():
    return platform.system() == 'Windows'


def is_macos():
    return platform.system() == 'Darwin'


def is_linux():
    return platform.system() == 'Linux'


def sanitize_error_text(text, limit: int = 600) -> str:
    """
    Engine and provider error text is shown verbatim in the Error dialog, so a
    gateway that answers with a web page (opencode Zen/Go return their HTML 404
    for an unknown route) would paste a whole document there. Keep the leading
    status line, say what happened, and cap everything else.
    """
    text = str(text)
    lowered = text.lower()
    if '<!doctype' in lowered or '<html' in lowered:
        head = text.split('<', 1)[0].strip()
        tail = 'The endpoint returned an HTML page instead of an API response.'
        return f'{head} {tail}' if head else tail
    collapsed = ' '.join(text.split())
    return collapsed if len(collapsed) <= limit else collapsed[:limit] + '…'
