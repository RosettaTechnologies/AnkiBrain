import asyncio
import atexit
import json
import platform
import subprocess
from collections import deque
from os import path

from InterprocessCommand import InterprocessCommand


class ExternalScriptManager:
    """
    Runs an external python script as a subprocess speaking line-delimited
    JSON on stdin/stdout (see ChatAI/__init__.py and voice/KokoroTTS/__init__.py).

    Optional hardening used by both engines:
      - env: custom environment (HF_HOME, ANKIBRAIN_TTS_DIR,
        TIKTOKEN_CACHE_DIR, ...)
      - stderr_log_path + drain: engine imports (torch/transformers, chromadb,
        a blocking download at import time) emit warnings that would otherwise
        fill the 64 KB stderr pipe and DEADLOCK the readline loop. The drainer
        reads stderr forever, appends to a log, and keeps a tail deque so
        failures can quote it.
      - startup_timeout: bounds the ready handshake, so an engine that hangs
        during import is killed and reported as a startup error instead of
        blocking the caller (and the webview's loading screen) forever.
    """

    def __init__(self, python_path, script_path, label='ChatAI', env=None,
                 stderr_log_path=None, startup_timeout=300):
        self.python_path = python_path
        self.script_path = script_path
        self.label = label
        self.env = env
        self.stderr_log_path = stderr_log_path
        self.startup_timeout = startup_timeout
        self.process = None
        self.lock = asyncio.Lock()
        self._stderr_task = None
        self._stderr_tail = deque(maxlen=60)

    async def start(self):
        creationflags = 0
        if platform.system() == 'Windows':
            creationflags = subprocess.CREATE_NO_WINDOW

        self.process = await asyncio.create_subprocess_exec(
            self.python_path,
            self.script_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=creationflags,
            limit=1024 * 1024 * 1024 * 1024,  # 1 GB
            env=self.env,
        )

        # Guarded, idempotent terminate (a raw Process.terminate registered
        # here would raise ProcessLookupError at exit once stop() already ran).
        atexit.register(self.terminate_sync)

        if self.stderr_log_path:
            from os import makedirs
            makedirs(path.dirname(self.stderr_log_path), exist_ok=True)
            self._stderr_task = asyncio.ensure_future(self._drain_stderr())

        # Wait for the ready message from external script. The wait is BOUNDED:
        # an engine that hangs during import (deadlocked C extension, broken
        # dependency, slow network fetch at import time) must surface as a
        # recoverable error instead of hanging the caller — and the webview's
        # loading screen — forever.
        print(f'Waiting for {self.label} Ready Message')
        try:
            ready_msg = await asyncio.wait_for(self.process.stdout.readline(),
                                               timeout=self.startup_timeout)
            if not ready_msg:
                raise Exception(f'{self.label} exited during startup without a ready message.\n'
                                f'Stderr tail:\n{self.stderr_tail_text()}')

            try:
                ready_data = json.loads(ready_msg.decode().strip())
            except ValueError:
                raise Exception(f'{self.label} ready message was not JSON: {ready_msg[:200]!r}')
            if ready_data.get('status') == 'success':
                print(f'Completed startup of {self.label} module')
            else:
                detail = ready_data.get('data', {}).get('error') if isinstance(ready_data.get('data'), dict) else None
                raise Exception(f'Error starting {self.label} module'
                                + (f': {detail}' if detail else ''))
        except asyncio.TimeoutError:
            tail = self.stderr_tail_text()[-1500:]
            await self._abort_startup()
            raise Exception(f'{self.label} did not report ready within '
                            f'{self.startup_timeout}s (startup hung).\nStderr tail:\n{tail}')
        except Exception:
            # Any other startup failure also has to leave no live process and
            # no running drain task behind, or the next start() leaks both.
            await self._abort_startup()
            raise

    async def _abort_startup(self):
        """
        Kill a half-started subprocess and stop its stderr drain, so a failed
        start() never leaves a live process or a running task behind.
        """
        if self.process is not None:
            try:
                self.process.kill()
            except ProcessLookupError:
                pass
            try:
                await self.process.wait()
            except Exception:
                pass
            if self._stderr_task:
                # Best effort: let the drainer consume what the dying process
                # already wrote, since the tail is quoted in the error.
                try:
                    await asyncio.wait_for(asyncio.shield(self._stderr_task), timeout=1.0)
                except (Exception, asyncio.CancelledError):
                    pass
            self.process = None
        if self._stderr_task:
            self._stderr_task.cancel()
            self._stderr_task = None

    async def _drain_stderr(self):
        stream = self.process.stderr
        with open(self.stderr_log_path, 'ab') as logf:
            while True:
                line = await stream.readline()
                if not line:
                    break
                self._stderr_tail.append(line.decode('utf-8', 'replace'))
                try:
                    logf.write(line)
                    logf.flush()
                except OSError:
                    pass

    def stderr_tail_text(self):
        return ''.join(self._stderr_tail).strip()

    async def stop(self):
        if self._stderr_task:
            self._stderr_task.cancel()
            self._stderr_task = None
        if self.process is not None:
            # The process may already be gone (killed externally, or it died on
            # its own): terminate() then raises ProcessLookupError, which must
            # never abort a restart/uninstall that is trying to clean up.
            try:
                self.process.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5)
            except asyncio.TimeoutError:
                try:
                    self.process.kill()
                except ProcessLookupError:
                    pass
                await self.process.wait()
            except ProcessLookupError:
                pass
            self.process = None

    def terminate_sync(self):
        if self.process is None:
            return

        print(f'Terminating {self.label} subprocess...')
        try:
            self.process.terminate()
        except ProcessLookupError:
            # Already gone: nothing to terminate, and atexit must not raise.
            pass

    def _check_dead(self):
        """A subprocess that died mid-conversation would otherwise make
        readline() hang forever; raise with the useful part of its log."""
        if self.process is None:
            raise Exception(f'{self.label}: module is not running')
        if self.process.returncode is not None:
            raise Exception(f'{self.label} process exited (code {self.process.returncode}).\n'
                            f'Stderr tail:\n{self.stderr_tail_text()[-1500:]}')

    async def call(self, input_data: dict) -> dict:
        try:
            self._check_dead()
            data_str: str = json.dumps(input_data)
            async with self.lock:  # Acquire lock before writing and draining
                self.process.stdin.write(data_str.encode() + b'\n')
                await self.process.stdin.drain()

            output_str = await self.process.stdout.readline()
            async with self.lock:  # Acquire lock again before loading the json
                if not output_str:
                    self._check_dead()
                    raise Exception(f'{self.label}: empty response (process gone?)')
                output_data = json.loads(output_str.decode().strip())

            # Handle module error.
            if output_data['cmd'] == InterprocessCommand.SUBMODULE_ERROR.value:
                error_msg = output_data['data']['error']
                raise Exception(error_msg)

            return output_data
        except Exception as e:
            raise Exception(str(e))
