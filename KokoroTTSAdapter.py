"""
AnkiBrain Voice — the Anki-side manager for the Kokoro TTS engine.

Mirrors ChatAIModuleAdapter: a thin async facade over ExternalScriptManager
talking to voice/KokoroTTS/__init__.py, which runs inside the dedicated
kokoro venv (user_files/voice/venv — Python 3.11 via uv, NOT the 3.9 ChatAI
venv; kokoro requires >=3.10,<3.13 so the two stacks cannot share).

Works identically in LOCAL and SERVER user modes: nothing here depends on
the ChatAI subprocess or the ankibrain-server; the engine spawns lazily on
the first synthesis request and unloads after an idle timeout so users who
never press a speaker icon (or who press it once and review for hours) pay
neither startup time nor ~500 MB of resident RAM forever.

The install/bootstrap lifecycle is *thread*-based, not subprocess-based:
Anki on Windows is a frozen launcher whose sys.executable cannot re-run
python scripts, so voice/KokoroBootstrap.run executes on a worker thread
and streams progress events back onto the asyncio loop.
"""

import asyncio
import os
import re
import threading
from os import path

from ExternalScriptManager import ExternalScriptManager
from voice import KokoroBootstrap
from voice import state as vstate

# Engine unloads itself after this many seconds of no synthesis (torch+model
# is roughly half a GB resident; Anki sessions are long).
IDLE_UNLOAD_SECONDS = 15 * 60

_CLOZE_RE = re.compile(r'\{\{c\d+::([^}:]*)((?:::)[^}]+?)?\}\}')
_TAG_RE = re.compile(r'<[^>]+>')
_WS_RE = re.compile(r'\s+')


def clean_text_for_speech(text, is_cloze=False):
    """
    Fields arrive as LLM-produced text that may carry cloze markers and/or
    inline HTML. Kokoro reads phonemes — '{{c1::powerhouse::hint}}' would be
    read literally — so strip the scaffolding, keep the words.
    """
    if not text:
        return ''
    text = str(text)
    if is_cloze:
        # {{c1::answer::hint}} -> answer  (the resolved sentence; the *audio*
        # is placed on the answer side only so hearing it never spoils Q)
        text = _CLOZE_RE.sub(lambda m: m.group(1), text)
    text = _TAG_RE.sub(' ', text)
    for entity, repl in (('&#39;', "'"), ('&quot;', '"'), ('&amp;', '&'),
                         ('&lt;', '<'), ('&gt;', '>'), ('&nbsp;', ' ')):
        text = text.replace(entity, repl)
    return _WS_RE.sub(' ', text).strip()


class TTSNotInstalledError(Exception):
    """Raised by synth() when the engine has never been set up. The bridge
    maps it to the webview's 'install voice?' flow rather than a raw error."""


class TTSUnsupportedError(Exception):
    """Platform has no vendored runtime (e.g. Intel Mac — no torch wheels)."""


class KokoroTTSAdapter:
    def __init__(self):
        self.script_manager = None
        self._starting = False
        self._idle_task = None
        self.last_request_at = 0.0
        self._bootstrap_thread = None
        self._bootstrap_cancel = None
        self._bootstrap_running = False

    # ───────────────────────────── paths / status ─────────────────────────

    def paths(self):
        override = None
        try:
            from aqt import mw
            override = mw.settingsManager.settings.get('ttsEngineRoot') or None
        except Exception:
            pass
        # VoicePaths may probe the filesystem (Windows long-path fallback);
        # cache per override instead of re-deriving on every status/synth call.
        if getattr(self, '_paths_cache', None) and self._paths_cache[0] == override:
            return self._paths_cache[1]
        p = vstate.VoicePaths(settings_override=override)
        self._paths_cache = (override, p)
        return p

    def status(self):
        """Full status payload for the webview (Settings + setup modal)."""
        st = vstate.current_status(settings_override=self._settings_root())
        st['engine_running'] = bool(self.script_manager and self.script_manager.process
                                   and self.script_manager.process.returncode is None)
        st['bootstrap_running'] = self._bootstrap_running
        return st

    def _settings_root(self):
        try:
            from aqt import mw
            return mw.settingsManager.settings.get('ttsEngineRoot') or None
        except Exception:
            return None

    def availability(self):
        """
        ('ready'|'absent'|'needs_sync'|'unsupported', reason|None)
        Cheap gate for synth requests — file checks only, no interpreter spawn.
        """
        p = self.paths()
        supported, reason = vstate.platform_support()
        if not supported:
            return 'unsupported', reason
        st = vstate.current_status(paths=p)
        status = st['status']
        if status == 'supported-but-absent':
            return 'absent', None
        if status == 'supported-and-needs-sync':
            return 'needs_sync', st.get('last_error')
        return 'ready', None

    def voice_allowed(self, voice):
        """True when the voice's language pack is installed (ja gate)."""
        lang = (voice or 'af_heart')[0].lower()
        if lang != 'j':
            return True
        st = vstate.load_state(self.paths()) or {}
        return bool((st.get('groups') or {}).get('ja'))

    # ───────────────────────────── engine lifecycle ─────────────────────

    async def start(self):
        if self.script_manager is not None and self.script_manager.process is not None:
            if self.script_manager.process.returncode is None:
                return
        p = self.paths()
        if not path.isfile(p.venv_python):
            raise TTSNotInstalledError('Kokoro voice engine is not installed on this machine.')

        if self._starting:
            # Coalesce concurrent first-requests onto one spawn.
            while self._starting:
                await asyncio.sleep(0.1)
            return
        self._starting = True
        try:
            os.makedirs(p.logs_dir, exist_ok=True)
            os.makedirs(p.audio_dir, exist_ok=True)
            self.script_manager = ExternalScriptManager(
                python_path=p.venv_python,
                script_path=path.join(vstate.VOICE_DIR, 'KokoroTTS', '__init__.py'),
                label='KokoroTTS',
                env=p.engine_env(),
                stderr_log_path=p.engine_stderr_log,
            )
            await self.script_manager.start()
            self._schedule_idle_unload()
        finally:
            self._starting = False

    async def stop(self):
        if self._idle_task:
            self._idle_task.cancel()
            self._idle_task = None
        if self.script_manager:
            await self.script_manager.stop()
            self.script_manager = None

    def _schedule_idle_unload(self):
        if self._idle_task:
            self._idle_task.cancel()
        self._idle_task = asyncio.ensure_future(self._idle_unload_loop())

    async def _idle_unload_loop(self):
        import time as _time
        try:
            while True:
                await asyncio.sleep(60)
                idle = _time.monotonic() - self.last_request_at
                if idle > IDLE_UNLOAD_SECONDS and self.script_manager:
                    alive = (self.script_manager.process
                             and self.script_manager.process.returncode is None)
                    if alive and not self._starting:
                        print(f'(KokoroTTS) idle {int(idle)}s -> unloading engine to free RAM')
                        await self.stop()
                        return
        except asyncio.CancelledError:
            return

    # ───────────────────────────── synthesis ─────────────────────────────

    async def synth(self, text, voice=None, speed=None):
        import time
        if self.script_manager is None or (
                self.script_manager.process and self.script_manager.process.returncode is not None):
            await self.start()
        self.last_request_at = time.monotonic()

        out = await self.script_manager.call({
            'cmd': 'SYNTH',
            'text': text,
            'voice': voice,
            'speed': speed,
        })
        return out['data']

    async def speak_clean(self, text, voice=None, speed=None, is_cloze=False):
        """Speak with the HTML/cloze stripping + settings defaults applied."""
        cleaned = clean_text_for_speech(text, is_cloze=is_cloze)
        if not cleaned:
            return None
        return await self.synth(cleaned, voice=voice, speed=speed)

    async def default_voice(self):
        try:
            from aqt import mw
            v = mw.settingsManager.settings.get('ttsVoice')
            if v:
                return v
        except Exception:
            pass
        return vstate.read_manifest()['model']['default_voice']

    async def default_speed(self):
        try:
            from aqt import mw
            s = mw.settingsManager.settings.get('ttsSpeed')
            if s:
                return float(s)
        except Exception:
            pass
        return 1.0

    # ───────────────────────────── bootstrap (install) ───────────────────

    def install_in_progress(self):
        return self._bootstrap_running

    def start_install(self, groups=('core',), on_event=None, on_done=None):
        """
        Run the pinned bootstrap on a worker thread. on_event/on_done are
        called ON THE UI/MAIN thread via aqt's timer-safe pattern? No: React
        bridge passes a scheduler that marshals onto the asyncio loop — we
        simply invoke whatever the caller gave us from the worker; the caller
        (ReactBridge) owns thread-safety via run_coroutine_threadsafe.
        Returns False if an install is already running.
        """
        if self._bootstrap_running:
            return False
        self._bootstrap_running = True
        self._bootstrap_cancel = threading.Event()

        def worker():
            try:
                KokoroBootstrap.run(groups=groups, paths=self.paths(),
                                    on_event=on_event, cancel=self._bootstrap_cancel)
                if on_done:
                    on_done({'ok': True})
            except KokoroBootstrap.BootstrapError as e:
                if on_done:
                    on_done({'ok': False, 'error': e.to_dict()})
            except Exception as e:  # unexpected crash: report, never propagate threads
                if on_done:
                    on_done({'ok': False, 'error': {'code': 'state', 'message': str(e), 'hint': None}})
            finally:
                self._bootstrap_running = False

        self._bootstrap_thread = threading.Thread(target=worker, daemon=True)
        self._bootstrap_thread.start()
        return True

    def cancel_install(self):
        if self._bootstrap_cancel:
            self._bootstrap_cancel.set()

    # ───────────────────────────── uninstall ──────────────────────────────

    def uninstall_data(self):
        """
        Delete the whole engine data tree (uv bin, standalone python, venv,
        caches, model weights, state.json) plus the synthesized-audio temp
        dir. CALL FROM A WORKER THREAD, after stop(): a venv is tens of
        thousands of small files, and on Windows the engine subprocess must
        already be gone or its DLLs lock the tree.

        Idempotent: a missing tree is a successful uninstall. Raises only
        when files remain (locked or permission-denied), so the UI can
        report honestly instead of showing a phantom 'not installed'.
        """
        import shutil
        p = self.paths()
        for d in (p.root, p.audio_dir):
            if path.isdir(d):
                shutil.rmtree(d, ignore_errors=True)
        leftovers = [d for d in (p.venv_python, p.state_path) if path.exists(d)]
        if leftovers:
            raise RuntimeError(
                'Some voice engine files could not be deleted (still present: '
                + ', '.join(leftovers[:3]) + '). Close other AnkiBrain windows and retry.'
            )
