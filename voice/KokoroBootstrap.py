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

Events (for the webview setup modal), all JSON-safe dicts:
    {'stage': 'uv|python|venv|engine|model|ja|test', 'status': 'start|progress|done',
     'message': str, 'received_mb': float, 'estimate_mb': float}

Failure raises BootstrapError(code, message, hint) — codes are stable strings
the React app maps to copy: 'download' | 'checksum' | 'uv' | 'sync' | 'model'
| 'ja_build' | 'cancel' | 'state'.

Air-gap/enterprise: the steps honor ambient env — a pre-seeded UV_* cache,
UV_PYTHON_INSTALL_MIRROR / HF_ENDPOINT (or *_OFFLINE) pass straight through,
and cached artifacts are skipped rather than re-fetched.
"""

import hashlib
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import threading
import time
import zipfile
from os import path

from voice import state as vstate


class BootstrapError(Exception):
    def __init__(self, code, message, hint=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint

    def to_dict(self):
        return {'code': self.code, 'message': self.message, 'hint': self.hint}


def _dir_mb(*dirs):
    total = 0
    for d in dirs:
        if not d or not path.isdir(d):
            continue
        for root, _files, names in os.walk(d, followlinks=False):
            for n in names:
                fp = path.join(root, n)
                try:
                    if not path.islink(fp):
                        total += os.path.getsize(fp)
                except OSError:
                    pass
    return total / 1e6


class _Runner:
    """Subprocess helper: logs to file, streams coarse progress, cancels cleanly."""

    def __init__(self, paths, on_event, cancel):
        self.paths = paths
        self.on_event = on_event or (lambda e: None)
        self.cancel = cancel  # threading.Event
        self.proc = None
        self._ticker = None
        self._stop_tick = threading.Event()

    # ------------------------------------------------------------- progress
    def _tick_loop(self, stage, message, estimate_mb, watched_dirs, baseline_mb):
        last = 0.0
        while not self._stop_tick.wait(2.0):
            if self.cancel.is_set():
                self._kill()
                return
            mb = max(0.0, _dir_mb(*watched_dirs) - baseline_mb)
            if mb >= last:
                self.on_event({'stage': stage, 'status': 'progress', 'message': message,
                               'received_mb': round(min(mb, estimate_mb), 1),
                               'estimate_mb': estimate_mb})
                last = mb

    def _kill(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()

    # ------------------------------------------------------------- execute
    def exec(self, stage, message, cmd, env=None, cwd=None, estimate_mb=None,
             watched_dirs=(), log_name=None):
        """
        Run cmd to completion. stdout+stderr go to <logs>/<name>; a ticker
        thread polls watched_dirs growth to emit progress events (robust
        across uv/torch versions — we never parse progress-bar escape codes).
        Returns (rc, combined_output_tail).
        """
        self._stop_tick.clear()
        baseline = _dir_mb(*watched_dirs)
        log_path = path.join(self.paths.logs_dir, log_name or (stage + '.log'))
        with open(log_path, 'wb') as logf:
            self.proc = subprocess.Popen(
                cmd, cwd=cwd, env=env,
                stdout=logf, stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                **({'creationflags': subprocess.CREATE_NO_WINDOW} if platform.system() == 'Windows' else {})
            )
            if estimate_mb:
                self._ticker = threading.Thread(
                    target=self._tick_loop,
                    args=(stage, message, estimate_mb, watched_dirs, baseline), daemon=True)
                self._ticker.start()
            try:
                while True:
                    try:
                        rc = self.proc.wait(timeout=1.0)
                        break
                    except subprocess.TimeoutExpired:
                        if self.cancel.is_set():
                            self._kill()
                            raise BootstrapError('cancel', 'Voice install cancelled.', None)
            finally:
                self._stop_tick.set()
                self.proc = None
        tail = ''
        try:
            with open(log_path, 'rb') as f:
                f.seek(max(0, os.path.getsize(log_path) - 4000))
                tail = f.read().decode('utf-8', 'replace')
        except OSError:
            pass
        return rc, tail


# ─────────────────────────────────────────── stages ──────────────────────────

def _manifest():
    return vstate.read_manifest()


def _fetch(url, dest, sha256, runner, stage, message, watched=None, estimate_mb=None):
    """
    stdlib download with sha256 verification. Skips entirely if dest already
    matches the expected digest (idempotent retries after a partial/cancelled
    run, and air-gapped drop-ins work by just placing the file).
    """
    import urllib.request

    if path.isfile(dest):
        h = hashlib.sha256()
        with open(dest, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                h.update(chunk)
        if h.hexdigest() == sha256:
            return dest

    est = estimate_mb or _manifest().get('size_estimates_mb', {}).get('download', {}).get(vstate.platform_key(), 760)
    watched = watched or [path.dirname(dest)]
    tmp = dest + '.part'
    os.makedirs(path.dirname(dest), exist_ok=True)

    # urllib has no streaming progress we can piggyback the ticker onto, so we
    # run our own tiny ticker around the blocking download call (delta vs the
    # size the watched dirs already had — cache dirs carry past downloads).
    stop = threading.Event()
    baseline = _dir_mb(*watched)

    def tick():
        last = 0.0
        while not stop.wait(2.0):
            mb = max(0.0, _dir_mb(*watched) - baseline)
            if mb >= last:
                runner.on_event({'stage': stage, 'status': 'progress', 'message': message,
                                 'received_mb': round(min(mb, est), 1), 'estimate_mb': est})
                last = mb

    t = threading.Thread(target=tick, daemon=True)
    t.start()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'AnkiBrain-Voice'})
        with urllib.request.urlopen(req, timeout=60) as r, open(tmp, 'wb') as f:
            shutil.copyfileobj(r, f)
    except Exception as e:
        if path.isfile(tmp):
            os.remove(tmp)
        raise BootstrapError('download', f'Could not download {url}: {e}',
                             'Check your network/proxy, or pre-place the file and retry.')
    finally:
        stop.set()
        t.join(timeout=1)

    h = hashlib.sha256()
    with open(tmp, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    if h.hexdigest() != sha256:
        os.remove(tmp)
        raise BootstrapError('checksum', f'Sha256 mismatch for {url} — refusing to use it.',
                             'Possible corrupt download or MITM; retry.')
    os.replace(tmp, dest)
    return dest


def _install_uv(runner):
    paths, m = runner.paths, _manifest()
    key = vstate.platform_key()
    plat = m['uv']['platforms'][key]
    archive = path.join(paths.cache_dir, 'downloads', plat['asset'])

    if path.isfile(paths.uv_bin):
        rc, tail = runner.exec('uv', 'checking uv', [paths.uv_bin, '--version'])
        if rc == 0 and m['uv']['version'] in tail:
            runner.on_event({'stage': 'uv', 'status': 'done', 'message': 'uv already installed',
                             'received_mb': 0, 'estimate_mb': 0})
            return

    url = m['uv']['releases_base'] + plat['asset']
    runner.on_event({'stage': 'uv', 'status': 'start', 'message': f'Downloading uv {m["uv"]["version"]}',
                     'received_mb': 0, 'estimate_mb': 25})
    _fetch(url, archive, plat['sha256'], runner, 'uv', f'Downloading uv {m["uv"]["version"]}',
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
    runner.on_event({'stage': 'uv', 'status': 'done', 'message': 'uv ready', 'received_mb': 0, 'estimate_mb': 0})


def _install_python(runner):
    paths, m = runner.paths, _manifest()
    ver = m['python']['version']
    env = paths.uv_env()
    rc, tail = runner.exec('python', 'Checking managed CPython',
                           [paths.uv_bin, 'python', 'list', '--only-installed'], env=env)
    if rc == 0 and ver in tail:
        runner.on_event({'stage': 'python', 'status': 'done', 'message': 'Python already installed',
                         'received_mb': 0, 'estimate_mb': 0})
        return
    runner.on_event({'stage': 'python', 'status': 'start', 'message': f'Installing CPython {ver}',
                     'received_mb': 0, 'estimate_mb': 30})
    rc, tail = runner.exec('python', f'Installing CPython {ver}',
                           [paths.uv_bin, 'python', 'install', ver], env=env,
                           estimate_mb=30, watched_dirs=[paths.python_dir, paths.cache_dir])
    if rc != 0:
        raise BootstrapError('uv', f'uv python install failed (rc={rc}): {tail}', None)


def _create_venv(runner):
    paths, m = runner.paths, _manifest()
    ver = m['python']['version']
    runner.on_event({'stage': 'venv', 'status': 'start', 'message': 'Creating kokoro environment',
                     'received_mb': 0, 'estimate_mb': 0})
    # --seed: ship pip inside the venv. spacy.cli.download (misaki's runtime
    # fallback if the model ever goes missing) shells out to `python -m pip`,
    # which fails in a bare uv venv.
    rc, tail = runner.exec('venv', 'Creating venv',
                           [paths.uv_bin, 'venv', '--clear', '--seed', '--python', ver, paths.venv_dir],
                           env=paths.uv_env())
    if rc != 0:
        raise BootstrapError('uv', f'uv venv failed (rc={rc}): {tail}', None)


def _sync_engine(runner):
    paths = runner.paths
    env = paths.uv_env()
    env['UV_PROJECT_ENVIRONMENT'] = paths.venv_dir
    # [tool.uv] package=false keeps the virtual project itself out of the env;
    # the optional `ja` dependency-group is only ever installed via
    # --group ja (in _install_ja_pack), never as part of the core sync.
    cmd = [paths.uv_bin, 'sync', '--frozen']
    est = _manifest()['size_estimates_mb']['download'].get(vstate.platform_key(), 760)
    runner.on_event({'stage': 'engine', 'status': 'start',
                     'message': 'Installing engine packages (PyTorch is the big one)',
                     'received_mb': 0, 'estimate_mb': est})
    rc, tail = runner.exec('engine', 'Installing engine packages', cmd, env=env,
                           cwd=vstate.VOICE_DIR,
                           estimate_mb=est,
                           watched_dirs=[paths.cache_dir, paths.venv_dir],
                           log_name='sync-engine.log')
    if rc != 0:
        raise BootstrapError('sync', f'Engine package sync failed (rc={rc}): {tail}',
                             'Retry to resume from cache; check disk space (see the size note).')


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
        runner.on_event({'stage': 'spacy', 'status': 'done', 'message': 'Tokenizer model present',
                         'received_mb': 0, 'estimate_mb': 0})
        return
    runner.on_event({'stage': 'spacy', 'status': 'start',
                     'message': f'Installing {sm["name"]} {sm["version"]}',
                     'received_mb': 0, 'estimate_mb': 15})
    rc, tail = runner.exec('spacy', f'Installing {sm["name"]}',
                           [paths.uv_bin, 'pip', 'install', '--python', paths.venv_python,
                            '--no-deps', sm['url']], env=paths.uv_env(),
                           estimate_mb=15, watched_dirs=[paths.cache_dir, paths.venv_dir])
    if rc != 0:
        raise BootstrapError('sync', f'spacy model install failed (rc={rc}): {tail}', None)


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
    rc, tail = runner.exec('model', 'Fetching Kokoro-82M voice model',
                           [paths.venv_python, '-c', code], env=paths.engine_env(),
                           estimate_mb=350, watched_dirs=[paths.hf_dir], log_name='snapshot.log')
    if rc != 0:
        raise BootstrapError('model', f'Voice model download failed (rc={rc}): {tail}',
                             'If you are behind a firewall, set HF_ENDPOINT to a mirror or retry.')


def _test_synth(runner):
    """
    End-to-end proof the install actually speaks: full pipeline build +
    synthesis + wav write. A green test step means the engine genuinely
    works, not merely that files landed on disk.
    """
    paths = runner.paths
    voice = _manifest()['model']['default_voice']
    code = (
        'import os, sys; '
        'from kokoro import KPipeline; '
        'p = KPipeline(lang_code=%r, repo_id=%r); '
        'audio = next(iter(p("AnkiBrain voice engine is ready.", voice=%r)))[2]; '
        'import soundfile as _sf; '
        'd = os.environ["ANKIBRAIN_TTS_DIR"]; os.makedirs(d, exist_ok=True); '
        'f = os.path.join(d, "kokoro-install-test.wav"); _sf.write(f, audio, 24000); '
        'sys.exit(0 if os.path.getsize(f) > 44 else 3)'
    ) % (voice[0], _manifest()['model']['hf_repo'], voice)
    rc, tail = runner.exec('test', 'Test synthesis', [paths.venv_python, '-c', code],
                           env=paths.engine_env(), log_name='warmup-test.log')
    if rc == 3:
        raise BootstrapError('model', 'Test synthesis produced an empty audio file.', None)
    if rc != 0:
        raise BootstrapError('model', f'Voice engine failed its own synthesis test (rc={rc}): {tail}',
                             'Retry the install; check that the disk did not fill up (see size note).')


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
    cmd = [paths.uv_bin, 'sync', '--frozen', '--group', 'ja']

    if plat_entry and plat_entry.get('url') and plat_entry.get('sha256'):
        whl_dir = path.join(paths.wheels_dir, vstate.wheel_tag_platform())
        whl = path.join(whl_dir, path.basename(plat_entry['url']))
        runner.on_event({'stage': 'ja', 'status': 'start',
                         'message': 'Installing Japanese voice pack', 'received_mb': 0, 'estimate_mb': 300})
        _fetch(plat_entry['url'], whl, plat_entry['sha256'], runner, 'ja',
               'Downloading prebuilt pyopenjtalk', watched=[paths.wheels_dir, paths.cache_dir],
               estimate_mb=10)
        rc, tail = runner.exec('ja', 'Installing prebuilt pyopenjtalk',
                               [paths.uv_bin, 'pip', 'install', '--python', paths.venv_python, whl],
                               env=env)
        if rc != 0:
            raise BootstrapError('sync', f'uv pip install pyopenjtalk failed (rc={rc}): {tail}', None)
    else:
        runner.on_event({'stage': 'ja', 'status': 'start',
                         'message': 'Building Japanese voice pack (needs cmake + C/C++ compiler)',
                         'received_mb': 0, 'estimate_mb': 300})

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


# ─────────────────────────────────────────── entry ──────────────────────────

def run(groups=('core',), paths=None, on_event=None, cancel=None, settings_override=None):
    """
    Install/repair the voice engine. groups ⊂ {'core'} always implied + optional
    {'ja'}. Returns the final state.json dict. Raises BootstrapError.
    Must run OUTSIDE the UI thread (worker thread from KokoroTTSManager).
    """
    paths = paths or vstate.VoicePaths(settings_override=settings_override)
    cancel = cancel or threading.Event()
    runner = _Runner(paths, on_event, cancel)
    supported, reason = vstate.platform_support()
    if not supported:
        raise BootstrapError('state', reason or 'Platform unsupported.', None)

    paths.ensure_dirs()
    groups = set(groups)

    try:
        if cancel.is_set():
            raise BootstrapError('cancel', 'Voice install cancelled.', None)
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
        runner.on_event({'stage': 'engine', 'status': 'error', 'message': e.message,
                         'error': e.to_dict(), 'received_mb': 0, 'estimate_mb': 0})
        raise

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
    runner.on_event({'stage': 'done', 'status': 'done', 'message': 'Voice engine ready',
                     'received_mb': 0, 'estimate_mb': 0})
    return st
