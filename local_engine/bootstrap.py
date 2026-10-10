"""
AnkiBrain LOCAL-mode engine bootstrap — provisions the ChatAI runtime from the
pinned local_engine/runtime-manifest.json + local_engine/uv.lock into one
self-contained data tree (user_files/local_engine/), with no admin rights, no
pyenv, no system Python and no shell scripts.

Run via ChatAIModuleAdapter (a worker thread inside the Anki process; NOT a
subprocess — Anki's frozen launcher makes sys.executable unreliable as a
"re-run me" interpreter). All network fetches are stdlib + sha256-verified; uv
itself then verifies every wheel/hash downstream.

    from local_engine import bootstrap
    bootstrap.run(paths=p, on_event=cb, cancel=ev)

Events (for the webview setup modal), all JSON-safe dicts:
    {'stage': 'uv|python|venv|packages|verify|done',
     'status': 'start|progress|done|error',
     'message': str, 'received_mb': float, 'estimate_mb': float}
Every stage emits start then done (an already-present step emits done only);
a failure emits error attributed to the stage that actually failed.

Failure raises BootstrapError(code, message, hint) — codes are stable strings
the React app maps to copy: 'download' | 'checksum' | 'uv' | 'sync' | 'verify'
| 'cancel' | 'state'.

Air-gap/enterprise: the steps honor ambient env — a pre-seeded UV_* cache
passes straight through, and cached artifacts are skipped rather than
re-fetched.
"""

import os
import shutil
import tarfile
import threading
import time
import zipfile
from os import path

from runtime_runner import BootstrapError, Runner, fetch, locate_binary
from local_engine import state as estate


# ─────────────────────────────────────────── stages ──────────────────────────

def _manifest():
    return estate.read_manifest()


def _bail(cancel):
    if cancel.is_set():
        raise BootstrapError('cancel', 'Local engine install cancelled.', None)


def _install_uv(runner):
    paths, m = runner.paths, _manifest()
    key = estate.platform_key()
    plat = m['uv']['platforms'][key]
    archive = path.join(paths.cache_dir, 'downloads', plat['asset'])

    if path.isfile(paths.uv_bin):
        rc, tail = runner.exec('uv', 'checking uv', [paths.uv_bin, '--version'])
        if rc == 0 and m['uv']['version'] in tail:
            runner.emit('uv', 'done', 'uv already installed')
            return

    url = m['uv']['releases_base'] + plat['asset']
    runner.emit('uv', 'start', f'Downloading uv {m["uv"]["version"]}', estimate_mb=25)
    fetch(url, archive, plat['sha256'], runner, 'uv', f'Downloading uv {m["uv"]["version"]}',
          watched=[paths.cache_dir], estimate_mb=25)

    extract_dir = path.join(paths.cache_dir, 'uv-extract')
    shutil.rmtree(extract_dir, ignore_errors=True)
    os.makedirs(extract_dir, exist_ok=True)
    if plat['asset'].endswith('.zip'):
        with zipfile.ZipFile(archive) as z:
            z.extractall(extract_dir)
    else:
        with tarfile.open(archive, 'r:gz') as t:
            t.extractall(extract_dir)
    src = locate_binary(extract_dir, plat['binary'])
    if src is None:
        raise BootstrapError('uv', 'uv archive layout unexpected (missing ' + plat['binary'] + ')',
                             'Manifest binary path out of sync with the release asset.')
    os.makedirs(paths.bin_dir, exist_ok=True)
    shutil.move(src, paths.uv_bin)
    if os.name != 'nt':
        os.chmod(paths.uv_bin, 0o755)

    rc, tail = runner.exec('uv', 'verifying uv', [paths.uv_bin, '--version'])
    if rc != 0 or m['uv']['version'] not in tail:
        raise BootstrapError('uv', f'Installed uv failed version check (rc={rc}): {tail}', None)
    runner.emit('uv', 'done', 'uv ready')


def _install_python(runner):
    paths, m = runner.paths, _manifest()
    ver = m['python']['version']
    env = paths.uv_env()
    rc, tail = runner.exec('python', 'Checking managed CPython',
                           [paths.uv_bin, 'python', 'list', '--only-installed'], env=env)
    if rc == 0 and ver in tail:
        runner.emit('python', 'done', 'Python already installed')
        return
    runner.emit('python', 'start', f'Installing CPython {ver}', estimate_mb=30)
    rc, tail = runner.exec('python', f'Installing CPython {ver}',
                           [paths.uv_bin, 'python', 'install', ver], env=env,
                           estimate_mb=30, watched_dirs=[paths.python_dir, paths.cache_dir])
    if rc != 0:
        raise BootstrapError('uv', f'uv python install failed (rc={rc}): {tail}', None)
    runner.emit('python', 'done', 'Python runtime ready')


def _create_venv(runner):
    paths, m = runner.paths, _manifest()
    ver = m['python']['version']
    runner.emit('venv', 'start', 'Creating engine environment')
    # --clear below: an existing venv is always recreated then re-synced from
    # the lock — seconds when the cache is warm, and drift (the whole reason a
    # repair runs) is healed rather than skipped. --seed keeps pip in the venv
    # so the environment is still a normal Python install for debugging.
    rc, tail = runner.exec('venv', 'Creating venv',
                           [paths.uv_bin, 'venv', '--clear', '--seed', '--python', ver, paths.venv_dir],
                           env=paths.uv_env())
    if rc != 0:
        raise BootstrapError('uv', f'uv venv failed (rc={rc}): {tail}', None)
    runner.emit('venv', 'done', 'Environment ready')


def _sync_packages(runner):
    paths = runner.paths
    env = paths.uv_env()
    # [tool.uv] package=false keeps the virtual project itself out of the env.
    env['UV_PROJECT_ENVIRONMENT'] = paths.venv_dir
    est = _manifest()['size_estimates_mb']['download'].get(estate.platform_key(), 380)
    runner.emit('packages', 'start', 'Installing AI packages', estimate_mb=est)
    rc, tail = runner.exec('packages', 'Installing AI packages',
                           [paths.uv_bin, 'sync', '--frozen'], env=env,
                           cwd=estate.LOCAL_ENGINE_DIR,
                           estimate_mb=est,
                           watched_dirs=[paths.cache_dir, paths.venv_dir],
                           log_name='sync.log')
    if rc != 0:
        raise BootstrapError('sync', f'Engine package sync failed (rc={rc}): {tail}',
                             'Retry to resume from cache; check disk space (see the size note).')
    runner.emit('packages', 'done', 'AI packages installed')


# Runs inside the engine venv. Proves the real ChatAI import graph loads and
# that the vector store actually round-trips a document — offline, with no
# settings.json and no API key, so it can never pass on a half-broken env. The
# round trip embeds with the real local ONNX MiniLM model, so a first install
# downloads it (~80 MB) here instead of stalling the user's first import.
_VERIFY_SCRIPT = '''\
import shutil
import sys
import tempfile

sys.path.insert(0, %(chatai)r)
sys.path.insert(1, %(root)r)

import ChatAIWithDocuments  # noqa: F401
import ChatAIWithoutDocuments  # noqa: F401
import ChatInterface  # noqa: F401
import document_images  # noqa: F401
import pptx_loader  # noqa: F401
from local_embeddings import LocalMiniLMEmbeddings

import bs4  # noqa: F401
import chromadb
import docx  # noqa: F401
import openai  # noqa: F401
import pptx  # noqa: F401
import pypdf  # noqa: F401
from langchain_community.callbacks import get_openai_callback  # noqa: F401
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

tmp = tempfile.mkdtemp()
try:
    store = Chroma(
        collection_name='ankibrain-verify',
        embedding_function=LocalMiniLMEmbeddings(),
        client=chromadb.PersistentClient(path=tmp),
    )
    store.add_documents([Document(page_content='hello engine')])
    hits = store.similarity_search('hello', k=1)
    if not hits:
        raise SystemExit('Chroma round trip returned no documents')
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('VERIFY_OK')
'''


def _verify(runner):
    """
    Smoke-test the freshly synced environment: import the whole subprocess
    graph and round-trip a real Chroma collection. A green verify means the
    engine genuinely works, not merely that files landed on disk.
    """
    paths = runner.paths
    runner.emit('verify', 'start', 'Verifying the engine (fetching the local embedding model)')
    script = path.join(paths.logs_dir, 'verify-script.py')
    with open(script, 'w', encoding='utf-8') as f:
        f.write(_VERIFY_SCRIPT % {'chatai': estate.CHATAI_DIR, 'root': estate.ADDON_ROOT})
    rc, tail = runner.exec('verify', 'Verifying the engine',
                           [paths.venv_python, script], env=paths.engine_env(),
                           log_name='verify.log')
    if rc != 0 or 'VERIFY_OK' not in tail:
        raise BootstrapError('verify', f'Engine verification failed (rc={rc}): {tail[-1500:]}',
                             f'Retry the install; the full output is in {path.join(paths.logs_dir, "verify.log")}.')
    runner.emit('verify', 'done', 'Engine verified')


# ─────────────────────────────────────────── entry ──────────────────────────

def run(paths=None, on_event=None, cancel=None):
    """
    Install/repair the LOCAL-mode engine from the pinned manifest + lock.

    Returns the final state.json dict. Raises BootstrapError.
    Must run OUTSIDE the UI thread (worker thread from ChatAIModuleAdapter).
    """
    paths = paths or estate.EnginePaths()
    cancel = cancel or threading.Event()
    runner = Runner(paths, on_event, cancel)
    supported, reason = estate.platform_support()
    if not supported:
        raise BootstrapError('state', reason or 'Platform unsupported.', None)

    paths.ensure_dirs()

    try:
        _bail(cancel)
        _install_uv(runner)
        _bail(cancel)
        _install_python(runner)
        _create_venv(runner)
        _bail(cancel)
        _sync_packages(runner)
        _verify(runner)
    except BootstrapError as e:
        existing = estate.load_state(paths) or {}
        existing['last_error'] = e.to_dict()
        existing.setdefault('groups', {'core': False})
        estate.save_state(paths, existing)
        runner.emit(runner.stage or 'packages', 'error', e.message, error=e.to_dict())
        raise

    # The engine verified end-to-end, so the pyenv-built legacy venv (the
    # install path that predates this bootstrap) is now dead weight.
    legacy = path.join(estate.ADDON_ROOT, 'user_files', 'venv')
    if path.isdir(legacy):
        shutil.rmtree(legacy, ignore_errors=True)

    # Remember the pins we verified end-to-end just now.
    uv_ver = ''
    try:
        rc, uv_ver = runner.exec('uv', 'version', [paths.uv_bin, '--version'])
    except BootstrapError:
        pass
    st = {
        'status': 'installed',
        'manifest_hash': estate.manifest_hash(),
        'lock_hash': estate.lock_hash(),
        'uv_version': (uv_ver or '').strip(),
        'python_version': _manifest()['python']['version'],
        'groups': {'core': True},
        'root': paths.root,
        'venv_python': paths.venv_python,
        'installed_at': int(time.time()),
        'last_error': None,
    }
    estate.save_state(paths, st)
    runner.emit('done', 'done', 'Local AI engine ready')
    return st
