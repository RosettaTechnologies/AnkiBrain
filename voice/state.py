"""
AnkiBrain Voice — runtime state shared by the Anki process, the bootstrap,
and the synthesis subprocess wiring.

Stdlib-only by design (no aqt imports): the Anki-side modules pass user
settings (root overrides) in as arguments, and the KokoroTTS synthesis
subprocess runs inside the kokoro venv where this package is not on its
sys.path at all. Everything lives under one "voice root" so the engine is
fully self-contained and survives add-on updates:

    <voice_root>/
        bin/uv(.exe)      bootstrap-pinned uv binary (sha256 from manifest)
        python/           UV_PYTHON_INSTALL_DIR (managed CPython 3.11)
        cache/            UV_CACHE_DIR (wheels — makes repair/reinstall fast)
        venv/             the kokoro environment (uv sync --frozen uv.lock)
        hf_cache/         HF_HOME (Kokoro-82M weights + voice tensors)
        wheels/           prebuilt wheelhouse downloads (pyopenjtalk etc.)
        logs/             uv/sync logs and engine stderr (drained tail)
        state.json        install state, compared against the manifest hash
"""

import hashlib
import json
import os
import platform
import shutil
from os import path

# The voice package dir and the add-on root, derived from __file__ only
# (no project_paths import: keep this loadable in bare stdlib contexts).
VOICE_DIR = path.abspath(path.dirname(__file__))
ADDON_ROOT = path.dirname(VOICE_DIR)
DEFAULT_VOICE_ROOT = path.join(ADDON_ROOT, 'user_files', 'voice')
MEDIA_TMP_DIR = path.join(ADDON_ROOT, 'user_files', 'media_tmp')
TTS_TMP_DIR = path.join(MEDIA_TMP_DIR, 'tts')

MANIFEST_PATH = path.join(VOICE_DIR, 'runtime-manifest.json')
LOCK_PATH = path.join(VOICE_DIR, 'uv.lock')

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


def wheel_tag_platform():
    """Wheel filename platform fragment for wheelhouse matching (PEP 425-ish)."""
    system = platform.system()
    machine = platform.machine().lower()
    if system == 'Linux':
        return 'linux_aarch64' if machine == 'aarch64' else 'linux_x86_64'
    if system == 'Darwin':
        return 'macosx_arm64' if machine == 'arm64' else 'macosx_x86_64'
    if system == 'Windows':
        return 'win_arm64' if machine in ('arm64', 'aarch64') else 'win_amd64'
    return f'{system.lower()}_{machine}'


def platform_support(key=None):
    """
    (supported: bool, reason: str|None) for the current platform.
    """
    key = key or platform_key()
    manifest = read_manifest()
    if key in manifest['uv']['platforms']:
        return True, None
    unsupported = manifest['uv'].get('unsupported_platforms', {})
    if key in unsupported:
        return False, unsupported[key]
    return False, f'The AnkiBrain Voice engine has no runtime build for platform "{key}".'


def windows_long_paths_ok(base_dir):
    """
    torch/transformers nest deep under site-packages. Windows builds with
    long-path support disabled (pre-1607 or policy off) die mid-extract at
    MAX_PATH. Probe by creating a deliberately deep directory tree under the
    candidate root; anything ~250+ chars must succeed.
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


def default_fallback_voice_root():
    """Short-path root for Windows boxes without long-path support."""
    local = os.environ.get('LOCALAPPDATA') or path.expanduser('~\\AppData\\Local')
    return path.join(local, 'AnkiBrain', 'voice')


class VoicePaths:
    """
    All engine locations derived from a voice root. The root may move (Windows
    short-path fallback, user override); uv.lock/uv.py live in the ADDON, only
    the data tree lives under the root, so moves are cheap — rebuild venv with
    `uv sync` from the shared cache in seconds, no re-download.
    """

    def __init__(self, root=None, settings_override=None):
        chosen = settings_override or root or DEFAULT_VOICE_ROOT
        self.root = path.abspath(chosen)
        self.fallback_used = False
        # Windows without long-path support: relocate once, transparently.
        if platform.system() == 'Windows' and not windows_long_paths_ok(self.root):
            self.root = default_fallback_voice_root()
            self.fallback_used = True
        self.bin_dir = path.join(self.root, 'bin')
        self.uv_bin = path.join(self.bin_dir, 'uv.exe' if platform.system() == 'Windows' else 'uv')
        self.python_dir = path.join(self.root, 'python')
        self.cache_dir = path.join(self.root, 'cache')
        self.venv_dir = path.join(self.root, 'venv')
        self.hf_dir = path.join(self.root, 'hf_cache')
        self.wheels_dir = path.join(self.root, 'wheels')
        self.logs_dir = path.join(self.root, 'logs')
        self.state_path = path.join(self.root, 'state.json')
        self.engine_stderr_log = path.join(self.logs_dir, 'engine-stderr.log')
        # Engine audio temp store (inside media_tmp for the existing 7-day GC)
        # Engine audio temp store: files land directly in media_tmp/tts so a
        # new synthesis bumps the dir mtime — the existing startup GC in
        # media_images.cleanup_media_tmp then expires stale previews after 7
        # days of no TTS use, with zero extra bookkeeping.
        self.audio_dir = TTS_TMP_DIR
        if platform.system() == 'Windows':
            self.venv_python = path.join(self.venv_dir, 'Scripts', 'python.exe')
        else:
            self.venv_python = path.join(self.venv_dir, 'bin', 'python')

    def ensure_dirs(self):
        for d in (self.bin_dir, self.python_dir, self.cache_dir, self.hf_dir,
                  self.wheels_dir, self.logs_dir):
            os.makedirs(d, exist_ok=True)
        os.makedirs(self.audio_dir, exist_ok=True)

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
        """Environment for the KokoroTTS synthesis subprocess."""
        env = dict(os.environ)
        env.update({
            'HF_HOME': self.hf_dir,
            'ANKIBRAIN_TTS_DIR': self.audio_dir,
            'PYTHONUNBUFFERED': '1',
            'PYTHONIOENCODING': 'utf-8',
        })
        if platform.system() == 'Darwin':
            # Kokoro README: MPS fallback for Apple Silicon GPU acceleration.
            env.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
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


def venv_present(paths):
    return path.isfile(paths.venv_python)


def current_status(paths=None, settings_override=None):
    """
    The verdict the UI branches on. Cheap: file checks + manifest comparison,
    no interpreter spawns.

    status ∈ {'supported-and-installed', 'supported-and-needs-sync'
              (manifest/lock drift since last install),
              'supported-but-absent', 'unsupported'}
    """
    paths = paths or VoicePaths(settings_override=settings_override)
    manifest = read_manifest()
    supported, reason = platform_support()
    state = load_state(paths)

    groups = (state or {}).get('groups', {})
    synced = (
        supported
        and venv_present(paths)
        and state is not None
        and groups.get('core')
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
        'voice_root': paths.root,
        'fallback_root_used': paths.fallback_used,
        'groups': groups,
        'ja_pack': bool(groups.get('ja')),
        'last_error': (state or {}).get('last_error'),
        'estimate': {
            'download_mb': sizes.get('download', {}).get(key, 760),
            'disk_mb': sizes.get('disk', {}).get(key, 1700),
            'ja_extra_mb': 300,
        },
        'languages': manifest['languages'],
        'default_voice': manifest['model']['default_voice'],
    }
