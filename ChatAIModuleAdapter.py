"""
AnkiBrain LOCAL-mode ChatAI adapter — the Anki-side manager for the ChatAI
subprocess and for the engine runtime that subprocess runs in.

Mirrors KokoroTTSAdapter: a thin async facade over ExternalScriptManager
talking to ChatAI/__init__.py, which runs inside the self-contained engine
venv (user_files/local_engine/venv — CPython 3.11 provisioned by uv, see
local_engine/bootstrap.py). Nothing here depends on a system Python, pyenv or
an OS installer.

The subprocess is built lazily in start(), never in __init__, because the venv
may not exist yet on a fresh install: status()/availability() answer "absent"
and the webview shows the setup modal, then start_install() provisions the
runtime on a worker thread and the boot loop retries start().
"""

import asyncio
import json
import os
import threading
from enum import Enum
from os import path
from typing import List, TypedDict, Optional

from AnkiBrainDocument import AnkiBrainDocument
from ExternalScriptManager import ExternalScriptManager
from InterprocessCommand import InterprocessCommand as IC
from local_engine import bootstrap, state as estate

ChatAI_module_init_path = path.join(estate.CHATAI_DIR, '__init__.py')

# No model download happens at import any more, so a healthy boot is seconds.
# Anything past this is a hang (broken import, deadlocked C extension) and must
# surface as a repairable error instead of an eternal "Starting AI Engine...".
STARTUP_TIMEOUT_SECONDS = 120

# A single request must never hold the webview's spinner forever: chat requests
# share one stdin/stdout pipe, so a wedged engine blocks every later command too.
REQUEST_TIMEOUT_SECONDS = 300


class LocalEngineNotInstalledError(Exception):
    """The engine runtime was never installed (no venv to run ChatAI in)."""


class LocalEngineError(Exception):
    """Engine installed, but it failed to start or died mid-session."""


class ChatAIModuleAdapter:
    """
    Thin async wrapper that runs the ChatAI module as an external python
    script inside the local engine venv, plus that venv's whole lifecycle
    (status / install / cancel / uninstall / user-data reset).
    """

    def __init__(self):
        self.scriptManager = None
        self._paths = None
        self._bootstrap_thread = None
        self._bootstrap_cancel = None
        self._bootstrap_running = False

    # ───────────────────────────── paths / status ─────────────────────────

    def paths(self) -> estate.EnginePaths:
        # EnginePaths may probe the filesystem (Windows long-path fallback);
        # derive once and reuse for every status/start/install call.
        if self._paths is None:
            self._paths = estate.EnginePaths()
        return self._paths

    def status(self) -> dict:
        """Full status payload for the webview (Settings + setup modal)."""
        st = estate.current_status(self.paths())
        st['bootstrap_running'] = self._bootstrap_running
        st['engine_running'] = bool(
            self.scriptManager and self.scriptManager.process
            and self.scriptManager.process.returncode is None)
        return st

    def availability(self):
        """
        ('ready'|'absent'|'needs_sync'|'unsupported', reason|None)
        Cheap gate for start(): file checks only, no interpreter spawn.
        """
        supported, reason = estate.platform_support()
        if not supported:
            return 'unsupported', reason
        status = estate.current_status(self.paths())['status']
        if status == 'supported-but-absent':
            return 'absent', None
        if status == 'supported-and-needs-sync':
            return 'needs_sync', None
        return 'ready', None

    # ───────────────────────────── engine lifecycle ───────────────────────

    async def start(self):
        if (self.scriptManager is not None and self.scriptManager.process is not None
                and self.scriptManager.process.returncode is None):
            return
        p = self.paths()
        if not estate.venv_present(p):
            raise LocalEngineNotInstalledError('The local AI engine is not installed.')

        os.makedirs(p.logs_dir, exist_ok=True)
        try:
            self.scriptManager = ExternalScriptManager(
                python_path=p.venv_python,
                script_path=ChatAI_module_init_path,
                label='ChatAI',
                env=p.engine_env(),
                stderr_log_path=p.subprocess_stderr_log,
                startup_timeout=STARTUP_TIMEOUT_SECONDS,
            )
            await self.scriptManager.start()
        except Exception as e:
            # Leave no half-built manager behind, and remember the failure so
            # the panel can offer Repair instead of an unexplained dead chat.
            self.scriptManager = None
            estate.record_error(p, {
                'code': 'start',
                'message': str(e)[:600],
                'hint': 'Open Settings → Local AI Engine and press Repair engine.',
            })
            raise LocalEngineError(str(e))
        # A successful start heals a previously recorded failure.
        estate.clear_error(p)

    async def stop(self):
        if self.scriptManager is None:
            return
        await self.scriptManager.stop()
        self.scriptManager = None

    # ───────────────────────────── bootstrap (install) ────────────────────

    def install_in_progress(self):
        return self._bootstrap_running

    def start_install(self, on_event=None, on_done=None):
        """
        Run the pinned bootstrap on a worker thread. on_event/on_done are called
        from that thread; the caller (ReactBridge) owns marshalling onto the
        asyncio loop. Returns False when an install is already running.
        """
        if self._bootstrap_running:
            return False
        self._bootstrap_running = True
        self._bootstrap_cancel = threading.Event()

        def worker():
            try:
                bootstrap.run(paths=self.paths(), on_event=on_event,
                              cancel=self._bootstrap_cancel)
                if on_done:
                    on_done({'ok': True})
            except bootstrap.BootstrapError as e:
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

    def cancel_install_and_wait(self, join_timeout=60):
        """
        Cancel an in-flight bootstrap and block until its worker thread has
        exited — the cancel flag is checked between download chunks and
        subprocess stages, so this is seconds in practice, with the join
        timeout as the backstop. Returns False when the worker is done, True
        when it is still alive after join_timeout. Must run OUTSIDE the UI
        thread (the caller runs it via asyncio.to_thread).
        """
        self.cancel_install()
        th = self._bootstrap_thread
        if th and th.is_alive():
            th.join(timeout=join_timeout)
        return bool(th and th.is_alive())

    # ───────────────────────────── uninstall / reset ──────────────────────

    def uninstall_data(self):
        """
        Delete the whole engine data tree (uv bin, managed python, venv,
        caches, logs, state.json). CALL FROM A WORKER THREAD, after stop():
        a venv is tens of thousands of small files, and on Windows the ChatAI
        subprocess must already be gone or its DLLs lock the tree.
        """
        estate.delete_engine_root(self.paths())

    def reset_user_data(self):
        """
        Delete the imported documents, their vector store, temp media and the
        saved OpenAI key. Settings, card backups and the engine tree are left
        alone. CALL FROM A WORKER THREAD (a Chroma store is many small files).
        """
        import shutil
        user_files = path.join(estate.ADDON_ROOT, 'user_files')
        for target in (path.join(user_files, 'db', 'chroma-persist'),
                       path.join(user_files, 'documents'),
                       path.join(user_files, 'media_tmp'),
                       path.join(user_files, 'documents.json'),
                       path.join(user_files, '.env')):
            if path.isdir(target):
                shutil.rmtree(target, ignore_errors=True)
            elif path.isfile(target):
                try:
                    os.remove(target)
                except OSError:
                    pass

    # ───────────────────────────── subprocess calls ───────────────────────

    class CallResponse(TypedDict):
        cmd: str
        data: dict
        error: Optional[str]

    async def _call_dict(self, data: dict[str, str]) -> CallResponse:
        if self.scriptManager is None:
            # Installed but between stop() and start() — a restart window lasts
            # as long as the engine's imports. That is not "never installed":
            # that path must not offer an install modal.
            if estate.venv_present(self.paths()):
                raise LocalEngineError(
                    'The local AI engine is not running yet. Press Restart AnkiBrain '
                    'in Settings → Local AI Engine and try again in a few seconds.')
            raise LocalEngineNotInstalledError('The local AI engine is not installed.')
        try:
            return await asyncio.wait_for(
                self.scriptManager.call(data), timeout=REQUEST_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            err = (f'The AI engine did not respond within {REQUEST_TIMEOUT_SECONDS}s. '
                   'Press Restart AnkiBrain in Settings → Local AI Engine, then try again.')
            estate.record_error(self.paths(), {'code': 'runtime', 'message': err, 'hint': None})
            raise LocalEngineError(err)
        except LocalEngineNotInstalledError:
            raise
        except Exception as e:
            # A crash mid-conversation (killed process, broken install) must be
            # remembered so the panel can offer the repair path.
            estate.record_error(self.paths(), {
                'code': 'runtime',
                'message': str(e)[:600],
                'hint': 'Press Restart AnkiBrain or Repair engine in Settings → Local AI Engine.',
            })
            raise LocalEngineError(str(e))

    async def call(self, cmd: IC, **kwargs) -> CallResponse:
        data = {'cmd': cmd.value}
        data.update(kwargs)
        print(f'<ChatAIModuleAdapter> Sending cmd to ChatAI module: {json.dumps(data)}')

        out = await self._call_dict(data)
        print(f'<ChatAIModuleAdapter> Received output from ChatAI module: {json.dumps(out)}')

        return out

    class AskWithDocumentsResponse(TypedDict):
        response: str
        source_documents: List[str]

    async def ask_conversation_with_documents(self, query: str) -> AskWithDocumentsResponse:
        output = await self.call(IC.ASK_CONVERSATION_DOCUMENTS, query=query)
        return output['data']

    class AskWithoutDocumentsResponse(TypedDict):
        response: str

    async def ask_conversation_no_documents(self, query: str) -> AskWithoutDocumentsResponse:
        output = await self.call(IC.ASK_CONVERSATION_NO_DOCUMENTS, query=query)
        return output['data']

    async def add_documents(self, documents: List[AnkiBrainDocument]):
        output = await self.call(IC.ADD_DOCUMENTS, documents=documents)
        return output['data']

    async def split_document(self, pth: str):
        output = await self.call(IC.SPLIT_DOCUMENT, path=pth)
        return output['data']

    async def explain_topic(self, topic, options):
        output = await self.call(
            IC.EXPLAIN_TOPIC,
            topic=topic,
            options=options
        )

        return output['data']

    class CardType(Enum):
        BASIC = 'basic'
        CLOZE = 'cloze'

    async def generate_cards(self, text: str, custom_prompt: str, card_type: CardType, language: str) -> dict:
        output = await self.call(IC.GENERATE_CARDS, text=text, custom_prompt=custom_prompt, type=card_type, language=language)
        return output['data']

    async def generate_occlusion_shapes(self, path: str, context: str, language: str) -> dict:
        output = await self.call(IC.GENERATE_OCCLUSION_SHAPES, path=path, context=context, language=language)
        return output['data']

    async def ask_dummy(self, query: str):
        import time
        time.sleep(5)
        return {'response': 'dummy response'}

    async def clear_conversation(self):
        output = await self.call(IC.CLEAR_CONVERSATION)
        return output['data']

    async def delete_all_documents(self):
        output = await self.call(IC.DELETE_ALL_DOCUMENTS)
        return output['data']
