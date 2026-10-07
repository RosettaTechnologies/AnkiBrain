"""
AnkiBrain LOCAL-mode engine — runtime state shared by the Anki process, the
bootstrap worker and (indirectly) the ChatAI subprocess wiring.

This is the LOCAL-mode counterpart of voice/state.py: exactly the same
lifecycle (detect → install → repair → cancel → uninstall) with exactly the
same self-contained data tree, so both engines are provisioned identically and
survive add-on updates:

    <engine_root>/
        bin/uv(.exe)      bootstrap-pinned uv binary (sha256 from manifest)
        python/           UV_PYTHON_INSTALL_DIR (managed CPython 3.11)
        cache/            UV_CACHE_DIR (wheels — makes repair/reinstall fast)
        venv/             the ChatAI environment (uv sync --frozen uv.lock)
        tiktoken/         TIKTOKEN_CACHE_DIR (BPE files cached across runs)
        logs/             uv/sync logs + the ChatAI subprocess stderr tail
        state.json        install state, compared against manifest + lock hash

Stdlib-only by design (no aqt imports): `python3 -m local_engine.state` is a
usable test CLI, and the webserver-side code never imports it.
"""

import hashlib
import json
import os
import platform
import shutil
from os import path

# The package dir and the add-on root, derived from __file__ only (no
# project_paths import: keep this loadable in bare stdlib contexts).
LOCAL_ENGINE_DIR = path.abspath(path.dirname(__file__))
ADDON_ROOT = path.dirname(LOCAL_ENGINE_DIR)
DEFAULT_ENGINE_ROOT = path.join(ADDON_ROOT, 'user_files', 'local_engine')
CHATAI_DIR = path.join(ADDON_ROOT, 'ChatAI')

MANIFEST_PATH = path.join(LOCAL_ENGINE_DIR, 'runtime-manifest.json')
LOCK_PATH = path.join(LOCAL_ENGINE_DIR, 'uv.lock')

_manifest_cache = None


def read_manifest():
    """Parsed runtime-manifest.json (cached in-process)."""
    global _manifest_cache
    if _manifest_cache is None:
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
            _manifest_cache = json.load(f)
    return _manifest_cache


def manifest_hash():
    """sha256 of the manifest bytes — stored in state.json, drift detector."""
    with open(MANIFEST_PATH, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def lock_hash():
    with open(LOCK_PATH, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def platform_key():
    """
    Normalized '<os>-<arch>' key used by the manifest, e.g. 'linux-x86_64',
    'darwin-aarch64', 'windows-amd64'. Windows reports AMD64/ARM64 upper-case;
    normalize both sides so the manifest lookup is exact.
    """
    system = platform.system().lower()
    machine = platform.machine().lower()
    if machine in ('x86_64', 'amd64'):
        norm = 'amd64' if system == 'windows' else 'x86_64'
    elif machine in ('arm64', 'aarch64'):
        norm = 'arm64' if system == 'windows' else 'aarch64'
    else:
        norm = machine
    return f'{system}-{norm}'


def platform_support(key=None):
    """
    (supported: bool, reason: str|None) for the current platform.

    `platforms` = uv has a vendored build for the OS/arch; `unsupported_platforms`
    = no uv build at all; `platforms_extra_unsupported` = uv exists but a locked
    dependency publishes no wheels there (Intel Macs).
    """
    key = key or platform_key()
    manifest = read_manifest()
    if key in manifest['uv']['platforms']:
        extra = manifest.get('platforms_extra_unsupported', {})
        if key in extra:
            return False, extra[key]
        return True, None
    unsupported = manifest['uv'].get('unsupported_platforms', {})
    if key in unsupported:
        return False, unsupported[key]
    return False, f'The AnkiBrain local AI engine has no runtime build for platform "{key}".'


def windows_long_paths_ok(base_dir):
    """
    A venv nests deep under site-packages. Windows builds with long-path
    support disabled (pre-1607 or policy off) die mid-extract at MAX_PATH.
    Probe by creating a deliberately deep directory tree under the candidate
    root; anything ~250+ chars must succeed.
    """
    if platform.system() != 'Windows':
        return True
    probe = path.join(base_dir, '_longpath_probe')
    long_tail = os.sep.join(['nestledirectory_%02d' % i for i in range(12)])  # ~228 chars
    target = path.join(probe, long_tail)
    try:
        os.makedirs(target, exist_ok=True)
        with open(path.join(target, 'ok.txt'), 'w') as f:
            f.write('ok')
        return True
    except OSError:
        return False
    finally:
        shutil.rmtree(probe, ignore_errors=True)


def default_fallback_engine_root():
    """Short-path root for Windows boxes without long-path support."""
    local = os.environ.get('LOCALAPPDATA') or path.expanduser('~\\AppData\\Local')
    return path.join(local, 'AnkiBrain', 'local_engine')


class EnginePaths:
    """
    All engine locations derived from one root. uv.lock/pyproject.toml live in
    the ADDON, only the data tree lives under the root, so a root move is cheap
    — rebuild the venv with `uv sync` from the shared cache in seconds.
    """

    def __init__(self, root=None):
        self.root = path.abspath(root or DEFAULT_ENGINE_ROOT)
        self.fallback_used = False
        # Windows without long-path support: relocate once, transparently.
        if platform.system() == 'Windows' and not windows_long_paths_ok(self.root):
            self.root = default_fallback_engine_root()
            self.fallback_used = True
        self.bin_dir = path.join(self.root, 'bin')
        self.uv_bin = path.join(self.bin_dir, 'uv.exe' if platform.system() == 'Windows' else 'uv')
        self.python_dir = path.join(self.root, 'python')
        self.cache_dir = path.join(self.root, 'cache')
        self.venv_dir = path.join(self.root, 'venv')
        self.logs_dir = path.join(self.root, 'logs')
        self.state_path = path.join(self.root, 'state.json')
        self.tiktoken_dir = path.join(self.root, 'tiktoken')
        self.subprocess_stderr_log = path.join(self.logs_dir, 'chatai-stderr.log')
        version = read_manifest()['python']['version']
        if platform.system() == 'Windows':
            self.venv_python = path.join(self.venv_dir, 'Scripts', 'python.exe')
            self.site_packages_dir = path.join(self.venv_dir, 'Lib', 'site-packages')
        else:
            self.venv_python = path.join(self.venv_dir, 'bin', 'python')
            self.site_packages_dir = f'{self.venv_dir}/lib/python{version.rsplit(".", 1)[0]}/site-packages'

    def ensure_dirs(self):
        for d in (self.bin_dir, self.python_dir, self.cache_dir, self.logs_dir,
                  self.tiktoken_dir):
            os.makedirs(d, exist_ok=True)

    def uv_env(self):
        """Environment for uv subprocess invocations (bootstrap)."""
        env = dict(os.environ)
        env.update({
            'UV_PYTHON_INSTALL_DIR': self.python_dir,
            'UV_CACHE_DIR': self.cache_dir,
            # Never let uv reach for a stray system interpreter: the manifest
            # pins one exact managed CPython build.
            'UV_PYTHON_PREFERENCE': 'only-managed',
            'UV_NO_CONFIG': '1',
            'PYTHONIOENCODING': 'utf-8',
        })
        return env

    def engine_env(self):
        """Environment for the ChatAI subprocess."""
        env = dict(os.environ)
        env.update({
            'TIKTOKEN_CACHE_DIR': self.tiktoken_dir,
            'PYTHONUNBUFFERED': '1',
            'PYTHONIOENCODING': 'utf-8',
        })
        return env


def load_state(paths):
    """Parsed state.json, or None when absent/corrupt (corrupt treated as absent)."""
    try:
        with open(paths.state_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save_state(paths, data):
    paths.ensure_dirs()
    tmp = paths.state_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, sort_keys=True)
    os.replace(tmp, paths.state_path)


def record_error(paths, err):
    """
    Remember a start/runtime failure in state.json for the UI banner.

    Deliberately does NOT touch `groups` or the recorded hashes: a crash must
    never look like manifest/lock drift, or the next boot would silently
    auto-repair instead of offering the explicit, user-visible Repair. When no
    state file exists yet the error still gets written (with groups.core false)
    so a failure before the first install is still surfaceable.
    """
    st = load_state(paths) or {}
    st.setdefault('groups', {'core': False})
    st['last_error'] = err
    save_state(paths, st)


def clear_error(paths):
    """Successful start heals the recorded failure. No state file → nothing."""
    st = load_state(paths)
    if st is None or st.get('last_error') is None:
        return
    st['last_error'] = None
    save_state(paths, st)


def venv_present(paths):
    return path.isfile(paths.venv_python) and path.isdir(paths.site_packages_dir)


def current_status(paths=None):
    """
    The verdict the UI branches on. Cheap: file checks + manifest/lock
    comparison, no interpreter spawns.

    status ∈ {'supported-and-installed', 'supported-and-needs-sync'
              (manifest/lock drift since last install),
              'supported-but-absent', 'unsupported'}
    """
    paths = paths or EnginePaths()
    manifest = read_manifest()
    supported, reason = platform_support()
    state = load_state(paths)

    groups = (state or {}).get('groups', {})
    synced = (
        supported
        and venv_present(paths)
        and state is not None
        and bool(groups.get('core'))
    )
    in_sync = synced and state.get('manifest_hash') == manifest_hash() and state.get('lock_hash') == lock_hash()

    if not supported:
        status = 'unsupported'
    elif not synced:
        status = 'supported-but-absent'
    elif not in_sync:
        status = 'supported-and-needs-sync'
    else:
        status = 'supported-and-installed'

    key = platform_key()
    sizes = manifest.get('size_estimates_mb', {})
    return {
        'status': status,
        'reason': reason,
        'platform': key,
        'engine_root': paths.root,
        'fallback_root_used': paths.fallback_used,
        'python_version': manifest['python']['version'],
        'venv_python': paths.venv_python,
        'last_error': (state or {}).get('last_error'),
        'estimate': {
            'download_mb': sizes.get('download', {}).get(key, 380),
            'disk_mb': sizes.get('disk', {}).get(key, 1100),
        },
    }


def delete_engine_root(paths):
    """
    Delete the whole engine data tree (uv bin, managed python, venv, caches,
    logs, state.json). CALL FROM A WORKER THREAD, after the ChatAI subprocess
    has stopped: a venv is tens of thousands of small files, and on Windows
    its DLLs lock the tree.

    Idempotent: a missing tree is a successful uninstall. Raises only when
    files remain (locked or permission-denied), so the UI can report honestly
    instead of showing a phantom 'not installed'.
    """
    if path.isdir(paths.root):
        shutil.rmtree(paths.root, ignore_errors=True)
    leftovers = [p for p in (paths.venv_python, paths.state_path) if path.exists(p)]
    if leftovers:
        raise RuntimeError(
            'Some engine files could not be deleted (still present: '
            + ', '.join(leftovers[:3]) + '). Close other AnkiBrain windows and retry.'
        )


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='AnkiBrain local engine state')
    parser.add_argument('--status', action='store_true', help='print current_status() as JSON')
    parser.add_argument('--uninstall', action='store_true', help='delete the engine data tree')
    args = parser.parse_args()
    _paths = EnginePaths()
    if args.uninstall:
        delete_engine_root(_paths)
        print(json.dumps({'ok': True}))
    else:
        print(json.dumps(current_status(_paths), indent=2, sort_keys=True))
