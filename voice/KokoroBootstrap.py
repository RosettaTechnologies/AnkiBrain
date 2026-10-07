"""
AnkiBrain Voice bootstrap — installs the kokoro engine hermetically from the
pinned voice/runtime-manifest.json + voice/uv.lock, on every supported OS with
no admin rights, no pyenv, no system Python and no shell scripts.

Run via KokoroTTSManager (a worker thread inside the Anki process; NOT a
subprocess — Anki's frozen launcher makes sys.executable unreliable as a
"re-run me" interpreter). All network fetches are stdlib + sha256-verified;
uv itself then verifies every wheel/hash downstream.

    from voice import KokoroBootstrap
    KokoroBootstrap.run(groups=('core',), paths=p, on_event=cb, cancel=ev)
    KokoroBootstrap.run(groups=('ja',), paths=p, on_event=cb, cancel=ev)   # add-on

groups=('core',) installs/repairs the engine; ('core','ja') does the full
install incl. Japanese; ('ja',) adds the Japanese pack to an existing
install without rebuilding the venv.

Events (for the webview setup modal), all JSON-safe dicts:
    {'stage': 'uv|python|venv|engine|spacy|ja|model|test|done',
     'status': 'start|progress|done|error',
     'message': str, 'received_mb': float, 'estimate_mb': float}
Every stage emits start then done (an already-present step emits done only);
a failure emits error attributed to the stage that actually failed.

Failure raises BootstrapError(code, message, hint) — codes are stable strings
the React app maps to copy: 'download' | 'checksum' | 'uv' | 'sync' | 'model'
| 'ja_build' | 'cancel' | 'state'.

Air-gap/enterprise: the steps honor ambient env — a pre-seeded UV_* cache,
UV_PYTHON_INSTALL_MIRROR / HF_ENDPOINT (or *_OFFLINE) pass straight through,
and cached artifacts are skipped rather than re-fetched.

The subprocess runner, sha256-verified downloader and BootstrapError are
shared with the LOCAL-mode engine bootstrap — see runtime_runner.py.
"""

import os
import platform
import shutil
import tarfile
import threading
import time
import zipfile
from os import path

from runtime_runner import BootstrapError, Runner, dir_mb, fetch
from voice import state as vstate


# ─────────────────────────────────────────── stages ──────────────────────────

def _manifest():
    return vstate.read_manifest()


def _install_uv(runner):
    paths, m = runner.paths, _manifest()
    key = vstate.platform_key()
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
    src = path.join(extract_dir, *plat['binary'].split('/'))
    if not path.isfile(src):
        raise BootstrapError('uv', 'uv archive layout unexpected (missing ' + plat['binary'] + ')',
                             'Manifest binary path out of sync with the release asset.')
    os.makedirs(paths.bin_dir, exist_ok=True)
    shutil.move(src, paths.uv_bin)
    if platform.system() != 'Windows':
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
    runner.emit('venv', 'start', 'Creating kokoro environment')
    # --seed: ship pip inside the venv. spacy.cli.download (misaki's runtime
    # fallback if the model ever goes missing) shells out to `python -m pip`,
    # which fails in a bare uv venv.
    rc, tail = runner.exec('venv', 'Creating venv',
                           [paths.uv_bin, 'venv', '--clear', '--seed', '--python', ver, paths.venv_dir],
                           env=paths.uv_env())
    if rc != 0:
        raise BootstrapError('uv', f'uv venv failed (rc={rc}): {tail}', None)
    runner.emit('venv', 'done', 'Environment ready')


def _sync_engine(runner):
    paths = runner.paths
    env = paths.uv_env()
    env['UV_PROJECT_ENVIRONMENT'] = paths.venv_dir
    # [tool.uv] package=false keeps the virtual project itself out of the env;
    # the optional `ja` dependency-group is only ever installed via
    # --group ja (in _install_ja_pack), never as part of the core sync.
    cmd = [paths.uv_bin, 'sync', '--frozen']
    est = _manifest()['size_estimates_mb']['download'].get(vstate.platform_key(), 760)
    runner.emit('engine', 'start', 'Installing engine packages (PyTorch is the big one)',
                estimate_mb=est)
    rc, tail = runner.exec('engine', 'Installing engine packages', cmd, env=env,
                           cwd=vstate.VOICE_DIR,
                           estimate_mb=est,
                           watched_dirs=[paths.cache_dir, paths.venv_dir],
                           log_name='sync-engine.log')
    if rc != 0:
        raise BootstrapError('sync', f'Engine package sync failed (rc={rc}): {tail}',
                             'Retry to resume from cache; check disk space (see the size note).')
    runner.emit('engine', 'done', 'Engine packages installed')


def _install_spacy_model(runner):
    """
    Pre-install the English spaCy pipeline misaki's G2P loads at runtime
    (en_core_web_sm). --no-deps because the wheel pins spacy==<model.minor>;
    our locked spacy 3.8.x satisfies the model's meta.json compatibility
    range. Skipped when the import already resolves (repair path).
    """
    paths, m = runner.paths, _manifest()
    sm = m['spacy_model']
    rc, _ = runner.exec('spacy', 'checking spacy model',
                        [paths.venv_python, '-c', f'import {sm["name"]}' ], env=paths.engine_env())
    if rc == 0:
        runner.emit('spacy', 'done', 'Tokenizer model present')
        return
    runner.emit('spacy', 'start', f'Installing {sm["name"]} {sm["version"]}', estimate_mb=15)
    rc, tail = runner.exec('spacy', f'Installing {sm["name"]}',
                           [paths.uv_bin, 'pip', 'install', '--python', paths.venv_python,
                            '--no-deps', sm['url']], env=paths.uv_env(),
                           estimate_mb=15, watched_dirs=[paths.cache_dir, paths.venv_dir])
    if rc != 0:
        raise BootstrapError('sync', f'spacy model install failed (rc={rc}): {tail}', None)
    runner.emit('spacy', 'done', 'English tokenizer ready')


def _snapshot_model(runner):
    """
    Pin + prefetch the exact Kokoro-82M artifacts (model .pth, config, default
    voice) via huggingface_hub at the manifest revision, into HF_HOME. This
    makes the engine reproducible across app updates (the runtime resolver
    finds a fully-cached repo and never negotiates versions on the user's
    first click).
    """
    paths, m = runner.paths, _manifest()
    code = (
        'from huggingface_hub import snapshot_download; '
        'snapshot_download(repo_id=%r, revision=%r, '
        'allow_patterns=["kokoro-v1_0.pth", "config.json", "voices/%s.pt"])'
        % (m['model']['hf_repo'], m['model']['hf_revision'], m['model']['default_voice'])
    )
    runner.emit('model', 'start', 'Fetching Kokoro-82M voice model', estimate_mb=350)
    rc, tail = runner.exec('model', 'Fetching Kokoro-82M voice model',
                           [paths.venv_python, '-c', code], env=paths.engine_env(),
                           estimate_mb=350, watched_dirs=[paths.hf_dir], log_name='snapshot.log')
    if rc != 0:
        raise BootstrapError('model', f'Voice model download failed (rc={rc}): {tail}',
                             'If you are behind a firewall, set HF_ENDPOINT to a mirror or retry.')
    runner.emit('model', 'done', 'Voice model ready')


def _test_synth(runner, voice=None, text=None):
    """
    End-to-end proof the install actually speaks: full pipeline build +
    synthesis + wav write. A green test step means the engine genuinely
    works, not merely that files landed on disk. voice/text override the
    English defaults — the ja pack test proves pyopenjtalk + unidic load.
    """
    paths = runner.paths
    voice = voice or _manifest()['model']['default_voice']
    text = text or 'AnkiBrain voice engine is ready.'
    code = (
        'import os, sys; '
        'from kokoro import KPipeline; '
        'p = KPipeline(lang_code=%r, repo_id=%r); '
        'audio = next(iter(p(%r, voice=%r)))[2]; '
        'import soundfile as _sf; '
        'd = os.environ["ANKIBRAIN_TTS_DIR"]; os.makedirs(d, exist_ok=True); '
        'f = os.path.join(d, "kokoro-install-test.wav"); _sf.write(f, audio, 24000); '
        'sys.exit(0 if os.path.getsize(f) > 44 else 3)'
    ) % (voice[0], _manifest()['model']['hf_repo'], text, voice)
    runner.emit('test', 'start', 'Testing synthesis')
    rc, tail = runner.exec('test', 'Test synthesis', [paths.venv_python, '-c', code],
                           env=paths.engine_env(), log_name='warmup-test.log')
    if rc == 3:
        raise BootstrapError('model', 'Test synthesis produced an empty audio file.', None)
    if rc != 0:
        raise BootstrapError('model', f'Voice engine failed its own synthesis test (rc={rc}): {tail}',
                             'Retry the install; check that the disk did not fill up (see size note).')
    runner.emit('test', 'done', 'Synthesis test passed')


def _install_ja_pack(runner):
    """
    Japanese support = misaki[ja] group + unidic dictionary download.
    pyopenjtalk ships sdist-only: prefer the prebuilt wheel from the manifest
    wheelhouse (fast, hermetic); otherwise uv builds from source (needs cmake
    + C/C++) and we surface a targeted error if that fails.
    """
    paths, m = runner.paths, _manifest()
    wp = m['wheelhouse']['packages']['pyopenjtalk']
    version = wp.get('version')
    plat_entry = wp.get(vstate.wheel_tag_platform()) if version else None

    env = paths.uv_env()
    env['UV_PROJECT_ENVIRONMENT'] = paths.venv_dir
    # --inexact: exact syncing would delete packages installed outside the
    # lock — the spaCy English model (_install_spacy_model) is installed via
    # `uv pip install`, so an exact ja sync would silently break English
    # synthesis. Inexact keeps it while still adding/fixing lock packages.
    cmd = [paths.uv_bin, 'sync', '--frozen', '--inexact', '--group', 'ja']

    if plat_entry and plat_entry.get('url') and plat_entry.get('sha256'):
        whl_dir = path.join(paths.wheels_dir, vstate.wheel_tag_platform())
        whl = path.join(whl_dir, path.basename(plat_entry['url']))
        runner.emit('ja', 'start', 'Installing Japanese voice pack', estimate_mb=300)
        fetch(plat_entry['url'], whl, plat_entry['sha256'], runner, 'ja',
               'Downloading prebuilt pyopenjtalk', watched=[paths.wheels_dir, paths.cache_dir],
               estimate_mb=10)
        rc, tail = runner.exec('ja', 'Installing prebuilt pyopenjtalk',
                               [paths.uv_bin, 'pip', 'install', '--python', paths.venv_python, whl],
                               env=env)
        if rc != 0:
            raise BootstrapError('sync', f'uv pip install pyopenjtalk failed (rc={rc}): {tail}', None)
    else:
        runner.emit('ja', 'start', 'Building Japanese voice pack (needs cmake + C/C++ compiler)',
                    estimate_mb=300)

    rc, tail = runner.exec('ja', 'Syncing Japanese packages', cmd, env=env, cwd=vstate.VOICE_DIR,
                           estimate_mb=300, watched_dirs=[paths.cache_dir, paths.venv_dir],
                           log_name='sync-ja.log')
    if rc != 0:
        raise BootstrapError('ja_build',
                             'Japanese voice pack failed to install (rc=%d). pyopenjtalk has no '
                             'prebuilt wheels yet and building it needs cmake and a C/C++ compiler.' % rc,
                             tail[-300:])
    # unidic dictionary: the pip package is a fetcher, data is downloaded once.
    rc, tail = runner.exec('ja', 'Downloading unidic dictionary',
                           [paths.venv_python, '-m', 'unidic', 'download'], env=paths.engine_env(),
                           estimate_mb=150, watched_dirs=[paths.venv_dir], log_name='unidic.log')
    if rc != 0:
        raise BootstrapError('ja_build', f'unidic dictionary download failed (rc={rc}): {tail}', None)
    runner.emit('ja', 'done', 'Japanese voice pack ready')


# ─────────────────────────────────────────── entry ──────────────────────────

def _ja_test_voice():
    """First Japanese voice in the manifest (fallback jf_alpha)."""
    try:
        return _manifest()['languages']['j']['voices'][0]
    except (KeyError, IndexError, TypeError):
        return 'jf_alpha'


def run(groups=('core',), paths=None, on_event=None, cancel=None, settings_override=None):
    """
    Install/repair the voice engine, or add a pack to an existing install.

    groups:
        ('core',)      full install/repair of the core engine
        ('core','ja')  full install/repair including the Japanese pack
        ('ja',)        add the Japanese pack to an already installed engine
                       (incremental: no venv rebuild, no re-download)

    Returns the final state.json dict. Raises BootstrapError.
    Must run OUTSIDE the UI thread (worker thread from KokoroTTSManager).
    """
    paths = paths or vstate.VoicePaths(settings_override=settings_override)
    cancel = cancel or threading.Event()
    runner = Runner(paths, on_event, cancel)
    supported, reason = vstate.platform_support()
    if not supported:
        raise BootstrapError('state', reason or 'Platform unsupported.', None)

    paths.ensure_dirs()
    groups = set(groups)
    ja_only = 'ja' in groups and 'core' not in groups

    try:
        if cancel.is_set():
            raise BootstrapError('cancel', 'Voice install cancelled.', None)
        if ja_only:
            # Add-on path: the core engine must already be installed. Only
            # the ja group is synced (--inexact keeps the spaCy model), then
            # a Japanese synthesis proves the pack actually works.
            state = vstate.load_state(paths) or {}
            core_installed = bool((state.get('groups') or {}).get('core'))
            if not vstate.venv_present(paths) or not core_installed:
                raise BootstrapError(
                    'state', 'The voice engine is not installed yet.',
                    'Install the voice engine first, then add the Japanese pack.')
            _install_ja_pack(runner)
            _test_synth(runner, voice=_ja_test_voice(), text='日本語の音声テストです。')
        else:
            _install_uv(runner)
            if cancel.is_set():
                raise BootstrapError('cancel', 'Voice install cancelled.', None)
            _install_python(runner)
            # --clear below: an existing venv is always recreated then re-synced
            # from the lock — seconds when the cache is warm, and drift (the whole
            # reason a repair runs) is healed rather than skipped.
            _create_venv(runner)
            _sync_engine(runner)
            _install_spacy_model(runner)
            if 'ja' in groups:
                _install_ja_pack(runner)
            _snapshot_model(runner)
            _test_synth(runner)
    except BootstrapError as e:
        existing = vstate.load_state(paths) or {}
        existing['last_error'] = e.to_dict()
        existing.setdefault('groups', {'core': False, 'ja': False})
        vstate.save_state(paths, existing)
        runner.emit(runner.stage or 'engine', 'error', e.message, error=e.to_dict())
        raise

    if ja_only:
        # Merge into the existing state: the core install (hashes, uv
        # version, installed_at) is untouched — only the pack flag flips.
        st = vstate.load_state(paths) or {}
        st.setdefault('groups', {'core': True, 'ja': False})
        st['groups']['ja'] = True
        st['last_error'] = None
        st['ja_installed_at'] = int(time.time())
    else:
        # Remember the pins we verified end-to-end just now.
        uv_ver = ''
        try:
            rc, uv_ver = runner.exec('uv', 'version', [paths.uv_bin, '--version'])
        except BootstrapError:
            pass
        st = {
            'status': 'installed',
            'manifest_hash': vstate.manifest_hash(),
            'lock_hash': vstate.lock_hash(),
            'uv_version': (uv_ver or '').strip(),
            'python_version': _manifest()['python']['version'],
            'groups': {'core': True, 'ja': 'ja' in groups},
            'root': paths.root,
            'venv_python': paths.venv_python,
            'installed_at': int(time.time()),
            'last_error': None,
        }
    vstate.save_state(paths, st)
    runner.emit('done', 'done', 'Japanese voice pack ready' if ja_only else 'Voice engine ready')
    return st
