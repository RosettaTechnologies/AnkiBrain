"""
Shared subprocess/download machinery for AnkiBrain's self-bootstrapping
runtimes (the Voice engine in `voice/` and the LOCAL-mode engine in
`local_engine/`).

Stdlib-only, no `aqt` imports: both bootstraps run on a worker thread inside
the Anki process and speak to the webview through plain dicts. The pieces here
are the ones that have no per-engine knowledge:

    BootstrapError   stable error code + user-facing message + hint
    dir_mb()         recursive directory size, used for coarse progress
    Runner           subprocess executor: logs to file, streams progress
                     events, cancels cleanly, attributes faults to a stage
    fetch()          stdlib download with sha256 verification

Event shape (JSON-safe, consumed by the webview setup modals):
    {'stage': str, 'status': 'start|progress|done|error',
     'message': str, 'received_mb': float, 'estimate_mb': float}
"""

import hashlib
import os
import platform
import subprocess
import threading
from os import path


class BootstrapError(Exception):
    def __init__(self, code, message, hint=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint

    def to_dict(self):
        return {'code': self.code, 'message': self.message, 'hint': self.hint}


def dir_mb(*dirs):
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


def locate_binary(extract_dir, rel):
    """Path to the manifest-named binary inside an extracted uv archive.

    `rel` is the manifest `binary` value. Release archives have shipped a
    different layout than the manifest names (uv 0.12.3 Windows zips are flat
    while the entry named a nested path), so fall back to a name search over the
    extracted tree. Returns None when neither matches.
    """
    candidate = path.join(extract_dir, *rel.split('/'))
    if path.isfile(candidate):
        return candidate
    wanted = rel.rsplit('/', 1)[-1]
    for base, _dirs, files in os.walk(extract_dir):
        if wanted in files:
            return path.join(base, wanted)
    return None


class Runner:
    """Subprocess helper: logs to file, streams coarse progress, cancels cleanly."""

    def __init__(self, paths, on_event, cancel):
        self.paths = paths
        self.on_event = on_event or (lambda e: None)
        self.cancel = cancel  # threading.Event
        self.proc = None
        self.stage = None  # running/last stage, so errors name the real step

    # ------------------------------------------------------------- progress
    def emit(self, stage, status, message, received_mb=0, estimate_mb=0, **extra):
        """Single funnel for stage events. Remembers the stage so an error
        raised mid-step can be attributed to the step that actually failed."""
        self.stage = stage
        ev = {'stage': stage, 'status': status, 'message': message,
              'received_mb': received_mb, 'estimate_mb': estimate_mb}
        ev.update(extra)
        self.on_event(ev)

    def _tick_loop(self, stop, stage, message, estimate_mb, watched_dirs, baseline_mb):
        last = 0.0
        while not stop.wait(2.0):
            if self.cancel.is_set():
                self._kill()
                return
            mb = max(0.0, dir_mb(*watched_dirs) - baseline_mb)
            if mb >= last:
                self.emit(stage, 'progress', message,
                          received_mb=round(min(mb, estimate_mb), 1),
                          estimate_mb=estimate_mb)
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
        The ticker owns a per-run stop event and is joined before returning,
        so a finished stage can never keep emitting into the next one (that
        race made the setup modal flash between adjacent stage messages).
        Returns (rc, combined_output_tail).
        """
        stop = threading.Event()
        ticker = None
        self.stage = stage
        baseline = dir_mb(*watched_dirs)
        log_path = path.join(self.paths.logs_dir, log_name or (stage + '.log'))
        with open(log_path, 'wb') as logf:
            self.proc = subprocess.Popen(
                cmd, cwd=cwd, env=env,
                stdout=logf, stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                **({'creationflags': subprocess.CREATE_NO_WINDOW} if platform.system() == 'Windows' else {})
            )
            if estimate_mb:
                ticker = threading.Thread(
                    target=self._tick_loop,
                    args=(stop, stage, message, estimate_mb, watched_dirs, baseline), daemon=True)
                ticker.start()
            try:
                while True:
                    try:
                        rc = self.proc.wait(timeout=1.0)
                        break
                    except subprocess.TimeoutExpired:
                        if self.cancel.is_set():
                            self._kill()
                            raise BootstrapError('cancel', 'Install cancelled.', None)
            finally:
                stop.set()
                if ticker is not None:
                    ticker.join(timeout=5)
                self.proc = None
        tail = ''
        try:
            with open(log_path, 'rb') as f:
                f.seek(max(0, os.path.getsize(log_path) - 4000))
                tail = f.read().decode('utf-8', 'replace')
        except OSError:
            pass
        return rc, tail


def fetch(url, dest, sha256, runner, stage, message, watched=None, estimate_mb=None):
    """
    stdlib download with sha256 verification. Skips entirely if dest already
    matches the expected digest (idempotent retries after a partial/cancelled
    run, and air-gapped drop-ins work by just placing the file).
    """
    import urllib.request

    runner.stage = stage  # attribute download faults to this step

    if path.isfile(dest):
        h = hashlib.sha256()
        with open(dest, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                h.update(chunk)
        if h.hexdigest() == sha256:
            return dest

    est = estimate_mb
    watched = watched or [path.dirname(dest)]
    tmp = dest + '.part'
    os.makedirs(path.dirname(dest), exist_ok=True)

    # urllib has no streaming progress we can piggyback the ticker onto, so we
    # run our own tiny ticker around the blocking download call (delta vs the
    # size the watched dirs already had — cache dirs carry past downloads).
    stop = threading.Event()
    baseline = dir_mb(*watched)

    def tick():
        last = 0.0
        while not stop.wait(2.0):
            mb = max(0.0, dir_mb(*watched) - baseline)
            if mb >= last:
                runner.emit(stage, 'progress', message,
                            received_mb=round(min(mb, est), 1), estimate_mb=est)
                last = mb

    t = threading.Thread(target=tick, daemon=True)
    t.start()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'AnkiBrain'})
        with urllib.request.urlopen(req, timeout=60) as r, open(tmp, 'wb') as f:
            # Chunked rather than copyfileobj so Cancel can interrupt a large
            # download (the PyTorch wheel is the big one) instead of waiting
            # for it to finish before the next cancel check.
            while True:
                if runner.cancel.is_set():
                    raise BootstrapError('cancel', 'Install cancelled.', None)
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
    except BootstrapError:
        # e.g. the cancel above — already in the caller's vocabulary, do not
        # relabel it as a download failure.
        if path.isfile(tmp):
            os.remove(tmp)
        raise
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
