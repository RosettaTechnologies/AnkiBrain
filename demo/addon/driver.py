"""
Demo add-on driver: runs the capture plan for one AnkiBrain pass.

Everything happens on the GUI thread. The work is written as a generator
(`Driver.run`) that yields wait conditions; a QTimer pump resolves each wait
and resumes the generator, so no step ever blocks on `time.sleep`.

Driven entirely by environment (set by demo/run.sh):

    ANKIBRAIN_DEMO_PASS        pass name (main | setup | server)
    ANKIBRAIN_DEMO_ROOT        demo/ directory
    ANKIBRAIN_DEMO_OUT         docs/screenshots (committed output)
    ANKIBRAIN_DEMO_LOGS        demo/out/logs
    ANKIBRAIN_DEMO_ONLY        comma list of shot ids (+ their `after` closure)
    ANKIBRAIN_DEMO_SKIP_AI     1: drop shots tagged ai
    ANKIBRAIN_DEMO_CAPTURE     capture backend override
    ANKIBRAIN_DEMO_PROBE       1: capture the probe set and quit
    ANKIBRAIN_DEMO_PROBE_DIR   where the probe writes
"""

import asyncio
import hashlib
import json
import os
import re
import time
import traceback
from os import path

from aqt import mw
from aqt.qt import *

from .capture import Capture, CaptureError
from . import steps as anki_steps

PANEL_PRELUDE = '_prelude.js'
DEFAULT_TIMEOUT_MS = 60000

# A rendered panel has chrome, text antialiasing and syntax colours; a flat
# block has a handful of values. Deliberately low: this only has to separate
# "web engine painted something" from "the capture is blank".
PROBE_MIN_COLORS = 40


class ShotSkipped(Exception):
    pass


class ShotTimeout(Exception):
    pass


class PassAborted(Exception):
    """Fatal for the whole pass (preflight failure): stops capturing and exits
    with a non-ok manifest instead of quietly skipping every AI shot."""


# ── waits ───────────────────────────────────────────────────────────────────

class Wait:
    """Base: pumped until poll() is true, then the generator resumes."""
    interval_ms = 250

    def __init__(self, describe, timeout_ms=DEFAULT_TIMEOUT_MS):
        self.describe = describe
        self.timeout_ms = timeout_ms
        self.started = time.monotonic()
        self.value = None

    def poll(self) -> bool:
        return True

    def expired(self, now):
        return self.timeout_ms is not None and (now - self.started) * 1000 > self.timeout_ms

    def timeout_error(self, now):
        waited = (now - self.started)
        return ShotTimeout(f'timed out after {waited:.1f}s waiting for {self.describe}')


class WaitTick(Wait):
    """One event-loop turn: let Qt/X flush paints that are already queued."""
    def __init__(self, timeout_ms=5000):
        super().__init__('one event-loop tick', timeout_ms)


class WaitSettle(Wait):
    """Compositor settle before a capture. Longer than a bare tick on purpose:
    the capture reads the X server's pixels, which lag Qt's repaint."""
    interval_ms = 50

    def __init__(self, ms=200):
        super().__init__(f'{ms}ms settle')
        self.ms = ms
        self.deadline = None

    def poll(self):
        now = time.monotonic()
        if self.deadline is None:
            self.deadline = now + self.ms / 1000.0
            return False
        return now >= self.deadline

    def expired(self, now):
        return False


class WaitMs(Wait):
    interval_ms = 50

    def __init__(self, ms, timeout_ms=None):
        super().__init__(f'{ms}ms', timeout_ms if timeout_ms is not None else ms + 5000)
        self.ms = ms
        self.deadline = None

    def poll(self):
        now = time.monotonic()
        if self.deadline is None:
            self.deadline = now + self.ms / 1000.0
            return False
        return now >= self.deadline

    def expired(self, now):
        return False


class WaitJs(Wait):
    """Poll a JS expression in the panel page until it is truthy."""
    def __init__(self, expression, timeout_ms=DEFAULT_TIMEOUT_MS, label=None):
        super().__init__(label or f'JS {expression[:90]}', timeout_ms)
        self.expression = expression
        self._inflight = False
        self._result = None
        self._seen = None

    def poll(self):
        # A result that arrived since the last tick decides this tick; only
        # start a new evaluation when there is neither one nor one in flight.
        if self._result is not None:
            value = self._result
            self._result = None
            return bool(value)
        if self._inflight:
            return False
        self._inflight = True

        def done(value):
            self._inflight = False
            self._result = value
            self._seen = value
        mw.ankiBrain.sidePanel.webview.page().runJavaScript(self.expression, done)
        return False

    def timeout_error(self, now):
        return ShotTimeout(
            f'timed out after {(now - self.started):.1f}s waiting for JS '
            f'{self.expression[:120]!r} (last value: {self._seen!r})')


class JsValue(Wait):
    """Run JS once and resume with its return value."""
    def __init__(self, code, timeout_ms=DEFAULT_TIMEOUT_MS, label=None):
        super().__init__(label or f'JS result {code[:60]}', timeout_ms)
        self.code = code
        self._inflight = False
        self._done = False

    def poll(self):
        if self._done:
            return True
        if self._inflight:
            return False
        self._inflight = True

        def done(value):
            self._inflight = False
            self._done = True
            self.value = value
        mw.ankiBrain.sidePanel.webview.page().runJavaScript(self.code, done)
        return False


class WaitPending(Wait):
    """Wait until every condition a step armed from a QTimer has settled.

    Without this, a shot whose real trigger lands after the step returned (a
    debounced selection popup, a modal file dialog) could be captured before
    that state existed and be recorded as ok with the wrong pixels.
    """
    interval_ms = 100

    def __init__(self, tokens, timeout_ms=DEFAULT_TIMEOUT_MS):
        super().__init__('armed step conditions', timeout_ms)
        self.tokens = tokens

    def poll(self):
        outstanding = [t for t in self.tokens if not t.get('done')]
        if not outstanding:
            return True
        for token in outstanding:
            if token.get('error'):
                raise ShotTimeout(f"{token['describe']}: {token['error']}")
        return False

    def timeout_error(self, now):
        outstanding = [t['describe'] for t in self.tokens if not t.get('done')]
        return ShotTimeout(f"timed out after {(now - self.started):.1f}s waiting for "
                           f"step conditions: {', '.join(outstanding)}")


class WaitFuture(Wait):
    """Wait for a concurrent.futures.Future (an asyncio task on the app loop)."""
    interval_ms = 100

    def __init__(self, future, describe, timeout_ms=DEFAULT_TIMEOUT_MS):
        super().__init__(describe, timeout_ms)
        self.future = future

    def poll(self):
        if not self.future.done():
            return False
        self.value = self.future.result()
        return True


# ── the pump ────────────────────────────────────────────────────────────────

class Pump:
    """Drives one generator with QTimer ticks. Any exception is thrown back
    into the generator at its current yield point, so the generator itself
    decides whether a failure is per-shot or fatal to the pass."""

    def __init__(self, generator, on_finish, on_error):
        self.gen = generator
        self.on_finish = on_finish
        self.on_error = on_error
        self.wait = None
        self.aborted = False

    def start(self):
        self._resume()

    def _resume(self, send_value=None, exc=None):
        if self.aborted:
            return
        try:
            if exc is not None:
                yielded = self.gen.throw(exc)
            else:
                yielded = self.gen.send(send_value)
        except StopIteration:
            self.on_finish()
            return
        except Exception as error:
            self.aborted = True
            self.on_error(error)
            return
        self.wait = yielded if isinstance(yielded, Wait) else WaitTick()
        self.wait.started = time.monotonic()
        QTimer.singleShot(0, self._tick)

    def _tick(self):
        wait = self.wait
        if wait is None or self.aborted:
            return
        try:
            done = wait.poll()
        except Exception as error:
            self.aborted = True
            self.on_error(error)
            return
        if done:
            self.wait = None
            value = wait.value
            QTimer.singleShot(0, lambda: self._resume(send_value=value))
            return
        now = time.monotonic()
        if wait.expired(now):
            error = wait.timeout_error(now)
            self.wait = None
            QTimer.singleShot(0, lambda: self._resume(exc=error))
            return
        QTimer.singleShot(wait.interval_ms, self._tick)

    def throw(self, error):
        """Fail the current wait from the outside (used by fatal preflight errors)."""
        self.wait = None
        QTimer.singleShot(0, lambda: self._resume(exc=error))


# ── shot registry ───────────────────────────────────────────────────────────

def load_registry(demo_root):
    with open(path.join(demo_root, 'shots.json'), 'r', encoding='utf-8') as f:
        return json.load(f)


def file_digest(pathname):
    """sha1 of a file, for comparing two captures byte for byte."""
    digest = hashlib.sha1()
    with open(pathname, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 16), b''):
            digest.update(block)
    return digest.hexdigest()


def selected_shots(registry, pass_name, only=None, skip_ai=False):
    """Shots for this pass, ascending order, plus the `after` closure of
    `only` and minus ai-tagged shots when asked."""
    shots = [shot for shot in registry['shots'] if shot.get('pass', 'main') == pass_name]
    shots.sort(key=lambda shot: shot['order'])
    if only:
        wanted = set(part.strip() for part in only.split(',') if part.strip())
        by_id = {shot['id']: shot for shot in registry['shots']}
        missing = sorted(wanted - set(by_id))
        if missing:
            raise ValueError(f'--only refers to unknown shot ids: {", ".join(missing)}')
        closure = set()

        def add(shot_id):
            if shot_id in closure:
                return
            closure.add(shot_id)
            for prereq in by_id[shot_id].get('after') or []:
                add(prereq)
        for shot_id in wanted:
            add(shot_id)
        shots = [shot for shot in shots if shot['id'] in closure]
    if skip_ai:
        # Drop the ai-tagged shots *and* the ones whose state they leave
        # behind: a shot that needs cards from a generation cannot run when
        # generation is off, and failing it would be noise.
        by_id = {shot['id']: shot for shot in registry['shots']}
        dropped = {shot['id'] for shot in shots if 'ai' in (shot.get('tags') or [])}

        def depends_on_dropped(shot):
            seen = set()
            stack = list(shot.get('after') or [])
            while stack:
                sid = stack.pop()
                if sid in dropped:
                    return True
                if sid in seen:
                    continue
                seen.add(sid)
                stack.extend((by_id.get(sid) or {}).get('after') or [])
            return False

        shots = [shot for shot in shots
                 if shot['id'] not in dropped and not depends_on_dropped(shot)]
    orders = [shot['order'] for shot in shots]
    if len(set(orders)) != len(orders):
        raise ValueError(f'duplicate shot orders in pass {pass_name!r}: {orders}')
    return shots


# ── the driver ──────────────────────────────────────────────────────────────

class Driver:
    def __init__(self, registry, options):
        self.pass_name = options['pass_name']
        self.demo_root = options['demo_root']
        self.out_dir = options['out_dir']
        self.log_dir = options['logs_dir']
        self.only = options.get('only')
        self.skip_ai = bool(options.get('skip_ai'))
        self.profile_name = options.get('profile_name') or ''
        self.backend = options.get('backend') or 'auto'
        self.capture = Capture(self.backend, log=self.log)
        self.registry = registry
        self.shots = selected_shots(registry, self.pass_name, self.only, self.skip_ai)
        self.records = {}
        self.pass_error = ''
        # Conditions armed by Anki-side steps (QTimer pollers); execute_shot
        # clears them per shot and waits for the live ones before capturing.
        self.pending_waits = []
        self.reviewer_suspended = []
        self.gate = {'ai': False, 'reason': 'not checked'}
        self.endpoint = None
        self._panel_files = {}
        self._manifest_path = path.join(self.out_dir, 'manifest.json')
        with open(path.join(self.demo_root, 'config.json'), 'r', encoding='utf-8') as f:
            self.config = json.load(f)
        if not self.backend or self.backend == 'auto':
            self.backend = self.config.get('capture_backend', 'auto')
            self.capture = Capture(self.backend, log=self.log)

    # ── utilities ──────────────────────────────────────────────────────────
    def log(self, message):
        print(f'[demo] {message}', flush=True)

    def fail_dir(self):
        target = path.join(self.log_dir, 'failures')
        os.makedirs(target, exist_ok=True)
        return target

    def js(self, code):
        """Fire-and-forget JS in the panel page."""
        mw.ankiBrain.sidePanel.webview.page().runJavaScript(code)

    def inject(self, payload):
        """Push a payload into the panel exactly as the Python side would."""
        self.log(f"inject {json.dumps(payload)[:160]}")
        mw.ankiBrain.reactBridge.send_to_js(payload)

    def panel_source(self, relative):
        if relative not in self._panel_files:
            with open(path.join(self.demo_root, 'steps', 'panel', relative), 'r',
                      encoding='utf-8') as f:
                self._panel_files[relative] = f.read()
        return self._panel_files[relative]

    def panel_rect(self) -> QRect:
        webview = mw.ankiBrain.sidePanel.webview
        return QRect(webview.mapTo(mw, QPoint(0, 0)), webview.size())

    def expand_paths(self, text):
        """`{repo}` / `{demo}` keep the committed registry portable."""
        return (text or '').replace('{repo}', path.dirname(self.demo_root)) \
                          .replace('{demo}', self.demo_root)

    def run_anki_step(self, spec):
        name, _, arg = spec.partition(':')
        arg = self.expand_paths(arg)
        handler = getattr(anki_steps, name, None)
        if handler is None:
            raise ShotSkipped(f'unknown anki step {name!r}')
        try:
            result = handler(self, arg)
        except anki_steps.SkipStep as error:
            raise ShotSkipped(str(error)) from error
        return result

    def run_panel_step(self, relative):
        """Run one panel step file.

        A file may contain several chunks separated by a line that is exactly
        `//---`; each chunk runs as its own JS task, which is what gives React
        (and the redux store) a chance to flush between a navigation click and
        whatever the next chunk reads. Without that, `demo.nav('Settings')`
        followed by a click on the settings screen in the same task would run
        against the previous screen.
        """
        prelude = self.panel_source(PANEL_PRELUDE)
        for index, chunk in enumerate(self.panel_chunks(relative)):
            code = (
                '(function(){\n'
                'try {\n' + prelude + '\n' + chunk + '\n'
                'return {ok: true};\n'
                '} catch (error) {\n'
                '  return {ok: false, error: String((error && error.message) || error)};\n'
                '}\n})()'
            )
            value = yield JsValue(code, timeout_ms=30000,
                                  label=f'panel step {relative} chunk {index + 1}')
            if not isinstance(value, dict) or not value.get('ok'):
                reason = (value or {}).get('error') if isinstance(value, dict) else repr(value)
                raise ShotSkipped(f'panel step {relative} failed: {reason}')

    def panel_chunks(self, relative):
        source = self.panel_source(relative)
        chunks = [chunk.strip() for chunk in
                  re.split(r'^[ \t]*//---[ \t]*$', source, flags=re.MULTILINE)]
        chunks = [chunk for chunk in chunks if chunk]
        if not chunks:
            raise ShotSkipped(f'panel step {relative} is empty')
        return chunks

    # ── preflight ──────────────────────────────────────────────────────────
    def preflight(self):
        """Engine/voice status, then the endpoint verification through the
        app's own networking code, then re-push the settings."""
        version = getattr(mw, 'CURRENT_VERSION', '')
        if not version:
            raise ShotSkipped('add-on did not set mw.CURRENT_VERSION')
        mode = mw.settingsManager.get('user_mode')
        self.log(f"pass {self.pass_name!r} mode={mode!r} addon={version} "
                 f"profile={mw.pm.name!r}")
        expected_profile = self.profile_name
        if expected_profile and mw.pm.name != expected_profile:
            raise PassAborted(
                f'wrong profile: {mw.pm.name!r} != {expected_profile!r} '
                '(demo base not built?)')
        try:
            engine = mw.ankiBrain.chatAI.status()
        except Exception as error:
            engine = {'status': f'error: {error}'}
        try:
            voice = mw.ankiBrain.tts.status()
        except Exception as error:
            voice = {'status': f'error: {error}'}
        self.log(f"engine={engine.get('status')} voice={voice.get('status')}")
        self.gate['engine'] = engine
        self.gate['voice'] = voice

        if mode != 'LOCAL':
            self.gate['ai'] = False
            self.gate['reason'] = f'user_mode is {mode!r}; no endpoint verification in this pass'
            return

        from dotenv import dotenv_values
        from networking import check_openai_endpoint
        from project_paths import dotenv_path

        api_key = (dotenv_values(dotenv_path).get('OPENAI_API_KEY') or '').strip()
        settings = mw.settingsManager.settings
        base_url = settings.get('openaiBaseUrl') or ''
        extra = settings.get('openaiExtraHeaders') or {}
        if not api_key:
            self.gate['ai'] = False
            self.gate['reason'] = 'no OPENAI_API_KEY in the demo .env'
            return
        future = asyncio.run_coroutine_threadsafe(
            check_openai_endpoint(api_key, base_url, extra), mw.ankiBrain.loop)
        result = yield WaitFuture(future, 'app endpoint verification')
        self.endpoint = result
        resolved = (base_url or '').strip().rstrip('/') or 'https://api.openai.com/v1'
        self.log(f"endpoint {resolved}: ok={result.get('ok')} "
                 f"key={(result.get('key') or {}).get('status')} "
                 f"models={len(result.get('models') or [])}")
        if not result.get('ok'):
            self.gate['ai'] = False
            self.gate['reason'] = (f"endpoint unreachable: {result.get('url_message')}"
                                   .replace('\n', ' ')[:300])
            return
        key = result.get('key') or {}
        if key.get('status') == 'rejected':
            self.gate['ai'] = False
            self.gate['reason'] = f"API key rejected: {key.get('message')}"[:300]
            raise PassAborted(f"the endpoint rejected the API key: {key.get('message')}")
        models = result.get('models') or []
        if models:
            mw.settingsManager.edit('openaiModels', list(models))
        mw.settingsManager.edit('openaiVerifiedUrl', base_url)
        mw.settingsManager.edit('openaiKeyStatus', key.get('status') or '')
        mw.settingsManager.edit('openaiKeyStatusMessage', str(key.get('message') or ''))
        mw.settingsManager.edit('openaiUrlStatusMessage', str(result.get('url_message') or ''))
        # Re-push through the app's own settings loader so the panel's store is
        # hydrated exactly as after a restart.
        again = asyncio.run_coroutine_threadsafe(mw.ankiBrain.load_user_settings(),
                                                mw.ankiBrain.loop)
        yield WaitFuture(again, 're-push settings to the panel')
        self.gate['ai'] = True
        self.gate['reason'] = ''

    # ── shot execution ─────────────────────────────────────────────────────
    def vision_prefixes(self):
        """Model prefixes the engine treats as vision-capable.

        ChatAI/ChatInterface.py can only be imported inside the engine
        subprocess (its dependencies never reach the add-on process), so the
        pinned constant is read from the source the engine actually runs.
        """
        source_path = path.join(path.dirname(self.demo_root), 'ChatAI', 'ChatInterface.py')
        try:
            with open(source_path, 'r', encoding='utf-8') as handle:
                source = handle.read()
        except OSError as error:
            self.log(f'vision prefixes unreadable ({error}); not gating vision shots')
            return ()
        match = re.search(r'VISION_MODEL_PREFIXES\s*=\s*\(([^)]*)\)', source)
        if not match:
            return ()
        return tuple(re.findall(r'[\'"]([^\'"]+)[\'"]', match.group(1)))

    def shot_gate(self, shot):
        """(ok, reason) for tags that depend on the environment."""
        tags = shot.get('tags') or []
        if 'ai' in tags and not self.gate.get('ai'):
            return False, f"AI gate closed - {self.gate.get('reason')}"
        if 'vision' in tags:
            model = str(mw.settingsManager.get('llmModel') or '')
            prefixes = self.vision_prefixes()
            if prefixes and not any(model.startswith(prefix) for prefix in prefixes):
                return False, (f'model {model!r} has no vision support '
                               f'(needs one of {", ".join(prefixes)})')
        if 'tts' in tags:
            status = (self.gate.get('voice') or {}).get('status')
            if status != 'supported-and-installed':
                return False, f'voice engine is {status!r}'
        if 'docs' in tags:
            status = (self.gate.get('engine') or {}).get('status')
            if status != 'supported-and-installed':
                return False, f'local engine is {status!r}'
        return True, ''

    def apply_surface(self, shot):
        """Shape the whole Anki window the shot is captured from.

        Every shot shows the real application: the main window plus the docked
        sidebar. Sizes come from config.json (`window`, `dock`) and a shot may
        override them; both are only applied when they differ, so the window
        does not relayout before every shot.
        """
        defaults = self.config.get('defaults') or {}
        window = shot.get('window') or defaults.get('window')
        dock = shot.get('dock') or defaults.get('dock')
        changed = False
        if window:
            size = [int(window[0]), int(window[1])]
            if [mw.width(), mw.height()] != size:
                self.log(f'window {size}')
                mw.resize(size[0], size[1])
                changed = True
        if dock:
            panel = mw.ankiBrain.sidePanel
            if mw.dockWidgetArea(panel) and panel.width() != int(dock):
                self.log(f'dock {dock}')
                mw.resizeDocks([panel], [int(dock)], Qt.Orientation.Horizontal)
                changed = True
        # A window wider than the screen would be captured with unpainted
        # (black) strips, so keep it inside the available area.
        screen = QApplication.primaryScreen()
        if screen is not None:
            available = screen.availableGeometry()
            if mw.width() > available.width() or mw.height() > available.height():
                size = [min(mw.width(), available.width()),
                        min(mw.height(), available.height())]
                self.log(f'window clamped to screen {size}')
                mw.resize(size[0], size[1])
                changed = True
        if changed:
            yield WaitSettle(400)

    def execute_shot(self, shot):
        """One shot: shape the surface, run the stages in order, capture, then
        run the teardown that puts the app back where the next shot expects it.

        A stage is `{anki, panel, wait_js | wait_ms}`; a shot without `stages`
        gets one implicit stage from its flat fields. Multi-stage shots exist
        for interactions that need a wait *between* clicks (wait for the answer,
        then expand its accordion; open the editor, then ask for masks)."""
        self.pending_waits = []
        yield from self.apply_surface(shot)
        stages = shot.get('stages')
        if not stages:
            stages = [{'anki': shot.get('anki'), 'panel': shot.get('panel'),
                       'wait_js': shot.get('wait_js'), 'wait_ms': shot.get('wait_ms')}]
        for index, stage in enumerate(stages):
            for spec in stage.get('anki') or []:
                self.log(f'anki step {spec}')
                self.run_anki_step(spec)
                yield WaitSettle(120)
            for relative in stage.get('panel') or []:
                self.log(f'panel step {relative}')
                yield from self.run_panel_step(relative)
            timeout = int(stage.get('timeout', shot.get('timeout', 60))) * 1000
            if stage.get('wait_js'):
                yield WaitJs(stage['wait_js'], timeout_ms=timeout)
            elif stage.get('wait_ms') is not None:
                yield WaitMs(int(stage['wait_ms']))
            if self.pending_waits:
                yield WaitPending(self.pending_waits)
            self.log(f'stage {index + 1}/{len(stages)} done')
        if shot.get('probe_js'):
            # Diagnostics: the value is logged, not asserted. Used to check
            # what a shot's surface really contains while tuning its waits.
            value = yield JsValue(shot['probe_js'], timeout_ms=15000,
                                  label=f"probe {shot['id']}")
            self.log(f"probe {shot['id']}: {value!r}")
        yield WaitSettle(250)
        yield from self.dismiss_toasts(shot)
        yield from self.write_capture(shot)
        for relative in shot.get('panel_after') or []:
            self.log(f'panel_after step {relative}')
            yield from self.run_panel_step(relative)
        for spec in shot.get('anki_after') or []:
            self.log(f'anki_after step {spec}')
            self.run_anki_step(spec)
            yield WaitSettle(120)
        if shot.get('after_js'):
            yield WaitJs(shot['after_js'],
                         timeout_ms=int(shot.get('after_timeout', 30)) * 1000)

    def dismiss_toasts(self, shot):
        """Close Chakra toasts before the capture.

        A toast (success banner, engine error) is rendered over the whole
        sidebar, so it would cover the surface the shot is about. This runs
        after the shot's waits have settled, because the toast a step triggers
        appears with the state the wait is looking for. A shot whose subject
        *is* a toast opts out with `keep_toasts`."""
        if shot.get('keep_toasts'):
            return
        # Three passes: the toast a step triggers lands a moment after the
        # state its wait watched for, so a single pass can run too early.
        total = 0
        for attempt in range(3):
            count = yield JsValue(
                "(() => { const buttons = [...document.querySelectorAll('.chakra-toast button')];"
                " buttons.forEach((b) => b.click()); return buttons.length; })()",
                timeout_ms=15000, label='dismiss toasts')
            total += int(count or 0)
            yield WaitSettle(250)
        if total:
            self.log(f'dismissed {total} toast(s)')

    def write_capture(self, shot):
        """Capture the Anki window, waiting for a frame that has settled.

        Every shot is the real application window (main window + docked
        sidebar). Chakra's modals and drawers fade in over ~200ms, and the X
        server can be read mid-fade - the layer behind shows through and the
        shot looks transparent - so captures repeat until two consecutive
        frames are byte-identical."""
        filename = f"{int(shot['order']):02d}-{shot['id']}.png"
        staging = path.join(self.fail_dir(), filename)
        info = yield from self.capture_stable(mw, staging)
        final = path.join(self.out_dir, filename)
        os.replace(staging, final)
        elapsed = int((time.monotonic() - self.shot_started) * 1000)
        self.record(shot, ok=True, file=filename, size=info.get('size'),
                    crop=info.get('crop'), backend=info.get('backend'),
                    elapsed_ms=elapsed)
        self.log(f"captured {filename} {info.get('size')} via {info.get('backend')} "
                 f"in {elapsed}ms")

    def capture_stable(self, widget, staging, tries=10, gap_ms=200):
        """`Capture.capture` until two frames in a row are identical.

        A frame that never stabilizes is legitimate (the Talk spinner animates
        forever), so the last one is kept after `tries` attempts."""
        previous = None
        info = None
        for attempt in range(tries):
            info = yield from self.capture_frame(widget, staging)
            digest = file_digest(staging)
            if digest == previous:
                self.log(f'stable frame after {attempt} repeat capture(s)')
                return info
            previous = digest
            if attempt < tries - 1:
                yield WaitMs(gap_ms)
        self.log(f'capture still changing after {tries} frames; keeping the last one')
        return info

    def capture_frame(self, widget, target):
        info = self.capture.capture(widget, target)
        # Captures read the X server, which lags Qt's own repaint: an event
        # loop turn between the capture and the next one is what lets a queued
        # repaint land in the following frame.
        yield WaitTick()
        return info

    # ── manifest ───────────────────────────────────────────────────────────
    def record(self, shot, ok=True, **fields):
        entry = {
            'id': shot['id'],
            'title': shot['title'],
            'feature': shot['feature'],
            'pass': shot.get('pass', 'main'),
            'order': shot['order'],
            'ok': bool(ok),
            'skipped': False,
            'error': '',
            'file': None,
            'size': None,
            'crop': None,
            'backend': None,
            'elapsed_ms': None,
            'anki_version': self.anki_version(),
            'addon_version': getattr(mw, 'CURRENT_VERSION', ''),
            'llm_model': mw.settingsManager.get('llmModel'),
            'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        }
        entry.update(fields)
        self.records[shot['id']] = entry

    @staticmethod
    def anki_version():
        import aqt
        return str(getattr(aqt, 'appVersion', '') or '')

    def write_manifest(self):
        manifest = {'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
                    'shots': {}}
        if path.isfile(self._manifest_path):
            try:
                with open(self._manifest_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
            except Exception:
                self.log('existing manifest.json unreadable; rewriting it')
        manifest['generated_at'] = time.strftime('%Y-%m-%dT%H:%M:%S')
        if self.pass_error:
            manifest.setdefault('pass_errors', {})[self.pass_name] = self.pass_error
        # What this run actually attempted, so a partial run (`--pass`,
        # `--only`) is never reported as a failed full run.
        manifest.setdefault('passes', {})[self.pass_name] = {
            'selected': [shot['id'] for shot in self.shots],
            'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        }
        # Shots dropped from the registry leave no trace: neither a manifest
        # entry nor a PNG from an older run.
        known = {shot['id'] for shot in self.registry['shots']}
        shots = {sid: entry for sid, entry in manifest.setdefault('shots', {}).items()
                 if sid in known}
        shots.update(self.records)
        manifest['shots'] = shots
        self.prune_output(known)
        os.makedirs(self.out_dir, exist_ok=True)
        with open(self._manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, sort_keys=True)
            f.write('\n')
        self.write_index(shots)

    def prune_output(self, known):
        """Delete published captures whose shot no longer exists."""
        try:
            entries = os.listdir(self.out_dir)
        except OSError:
            return
        for name in entries:
            match = re.match(r'^\d+-(.+)\.png$', name)
            if match and match.group(1) not in known:
                os.remove(path.join(self.out_dir, name))
                self.log(f'pruned stale capture {name}')

    def write_index(self, shots):
        rows = []
        for entry in sorted(shots.values(), key=lambda e: (e.get('order', 0), e.get('id', ''))):
            if entry.get('skipped') or not entry.get('ok') or not entry.get('file'):
                continue
            rows.append(f"| ![]({entry['file']}) | `{entry['id']}` | "
                        f"{entry.get('feature', '')} | {entry.get('title', '')} |")
        body = ['# AnkiBrain screenshots', '',
                'Generated by `demo/run.sh` from a real Anki session. '
                'Do not edit by hand.', '',
                '| Screenshot | Shot id | Feature | What it shows |',
                '| --- | --- | --- | --- |', *rows, '']
        with open(path.join(self.out_dir, 'index.md'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(body))

    # ── the generator ──────────────────────────────────────────────────────
    def run(self):
        self.log(f'pass {self.pass_name!r}: {len(self.shots)} shots '
                 f'({", ".join(shot["id"] for shot in self.shots)})')
        if os.environ.get('ANKIBRAIN_DEMO_PROBE') == '1':
            yield from self.run_probe()
            return
        yield from self.wait_ready()
        try:
            yield from self.preflight()
        except ShotSkipped as error:
            self.gate['ai'] = False
            self.gate['reason'] = str(error)
            self.log(f'preflight: {error}')
        for shot in self.shots:
            ok, reason = self.shot_gate(shot)
            if not ok:
                self.log(f'skip {shot["id"]}: {reason}')
                self.record(shot, ok=True, skipped=True, error='', reason=reason)
                continue
            self.shot_started = time.monotonic()
            try:
                yield from self.execute_shot(shot)
            except ShotSkipped as error:
                self.log(f'skip {shot["id"]}: {error}')
                self.record(shot, ok=True, skipped=True, error='', reason=str(error))
            except Exception as error:
                traceback.print_exc()
                self.log(f'FAIL {shot["id"]}: {error}')
                self.record(shot, ok=False, skipped=False, error=str(error)[:500])
                self.keep_failure(shot)
            finally:
                self.cancel_pending_waits()

    def cancel_pending_waits(self):
        """Stop the pollers this shot armed. They keep ticking on QTimers, and
        a late failure would otherwise be thrown at whatever shot is running
        when it fires."""
        for token in self.pending_waits:
            token['cancelled'] = True
        self.pending_waits = []

    def keep_failure(self, shot):
        """A failed shot never reaches docs/screenshots/: its capture (from this
        attempt or an earlier one) stays in the failures directory as debug
        evidence."""
        filename = f"{int(shot['order']):02d}-{shot['id']}.png"
        staging = path.join(self.fail_dir(), filename)
        published = path.join(self.out_dir, filename)
        if path.isfile(published):
            os.replace(published, staging)
        if path.isfile(staging):
            self.log(f'failure capture kept at {staging}')

    def wait_ready(self):
        yield WaitJs(
            "!!document.querySelector('.App') && !document.getElementById('GlobalLoadingIndicator')",
            timeout_ms=180000, label="panel app ready (' .App' with no global loader)")
        yield WaitSettle(300)

    def run_probe(self):
        """Capture the demo surface through both backends and report which one
        actually painted the panel."""
        probe_dir = os.environ.get('ANKIBRAIN_DEMO_PROBE_DIR') or path.join(self.log_dir, 'probe')
        os.makedirs(probe_dir, exist_ok=True)
        yield from self.wait_ready()
        yield WaitSettle(600)
        report = {'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'crops': {},
                  'windows': {}, 'panel_rect': None, 'backend_config': self.backend}
        rect = self.panel_rect()
        report['panel_rect'] = [rect.x(), rect.y(), rect.width(), rect.height()]
        report['window'] = {'size': [mw.width(), mw.height()],
                            'device_pixel_ratio': self.capture.dpr(mw)}
        for backend in ('x11', 'grab'):
            capture = Capture(backend, log=self.log)
            window_png = path.join(probe_dir, f'window-{backend}.png')
            try:
                info = capture.capture(mw, window_png)
                report['windows'][backend] = {'size': info['size'], 'file': window_png}
            except Exception as error:
                report['windows'][backend] = {'error': str(error)}
                self.log(f'probe {backend}: window capture failed: {error}')
                continue
            panel_png = path.join(probe_dir, f'panel-crop-{backend}.png')
            try:
                info = capture.capture(mw, panel_png, crop=rect)
                # The file is already the panel region, so sample all of it.
                colors = capture.distinct_colors(panel_png, None, step=4)
                # `used` differs from the key when x11 fell back to grab.
                report['crops'][backend] = {'size': info['size'], 'colors': colors,
                                            'used': info['backend'], 'file': panel_png}
            except Exception as error:
                report['crops'][backend] = {'error': str(error)}
                self.log(f'probe {backend}: panel crop failed: {error}')
        candidates = [(backend, entry.get('colors', 0))
                      for backend, entry in report['crops'].items()
                      if entry.get('colors', 0) >= PROBE_MIN_COLORS]
        candidates.sort(key=lambda item: (-item[1], item[0] != 'x11'))
        report['winner'] = candidates[0][0] if candidates else None
        report['min_colors'] = PROBE_MIN_COLORS
        with open(path.join(probe_dir, 'report.json'), 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, sort_keys=True)
        self.log(f"probe winner: {report['winner']!r} "
                 f"({json.dumps({k: v.get('colors') for k, v in report['crops'].items()})})")
        self.write_pass_log()

    # ── shutdown ───────────────────────────────────────────────────────────
    def write_pass_log(self):
        os.makedirs(self.log_dir, exist_ok=True)
        payload = {'pass': self.pass_name, 'finished_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
                   'gate': {k: v for k, v in self.gate.items() if k != 'engine' and k != 'voice'},
                   'engine': (self.gate.get('engine') or {}).get('status'),
                   'voice': (self.gate.get('voice') or {}).get('status'),
                   'records': self.records}
        with open(path.join(self.log_dir, f'{self.pass_name}.json'), 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2, sort_keys=True)
        with open(path.join(self.log_dir, f'{self.pass_name}.done'), 'w', encoding='utf-8') as f:
            json.dump({'pass': self.pass_name, 'shots': len(self.records),
                       'failed': [k for k, v in self.records.items() if not v.get('ok')]}, f)

    def finish_pass(self):
        if os.environ.get('ANKIBRAIN_DEMO_PROBE') != '1':
            self.write_manifest()
        self.write_pass_log()
        self.log('captures done; quitting Anki')
        try:
            mw.pm.profile['confirmExit'] = False
            mw.pm.save()
        except Exception as error:
            self.log(f'could not clear confirmExit: {error}')
        QTimer.singleShot(200, mw.close)

    def fatal(self, error):
        self.log(f'pass aborted: {error}')
        traceback.print_exception(type(error), error, error.__traceback__)
        self.pass_error = str(error)[:500]
        self.write_manifest()
        self.write_pass_log()
        QTimer.singleShot(200, mw.close)


# ── entry from the add-on hook ──────────────────────────────────────────────

def start():
    if not os.environ.get('ANKIBRAIN_DEMO_PASS'):
        return
    options = {
        'pass_name': os.environ.get('ANKIBRAIN_DEMO_PASS', 'main'),
        'demo_root': os.environ['ANKIBRAIN_DEMO_ROOT'],
        'out_dir': os.environ['ANKIBRAIN_DEMO_OUT'],
        'logs_dir': os.environ['ANKIBRAIN_DEMO_LOGS'],
        'only': os.environ.get('ANKIBRAIN_DEMO_ONLY') or None,
        'skip_ai': os.environ.get('ANKIBRAIN_DEMO_SKIP_AI') == '1',
        'backend': os.environ.get('ANKIBRAIN_DEMO_CAPTURE') or None,
        'profile_name': os.environ.get('ANKIBRAIN_DEMO_PROFILE') or '',
    }
    state = {'started': time.monotonic(), 'waited': False, 'driver': None, 'pump': None}

    def poll():
        if state['driver'] is not None:
            return  # a second poll chain must never start a second driver
        # Never rely on hook order: the add-on under test may not have built
        # mw.ankiBrain (or loaded its webview) when this fires.
        brain = getattr(mw, 'ankiBrain', None)
        if brain is None or not getattr(brain, 'webview_loaded', False):
            if not state['waited']:
                state['waited'] = True
                print('[demo] waiting for mw.ankiBrain and the dock webview', flush=True)
            if time.monotonic() - state['started'] > 180:
                print('[demo] gave up waiting for mw.ankiBrain', flush=True)
                return
            QTimer.singleShot(300, poll)
            return
        try:
            driver = Driver(load_registry(options['demo_root']), options)
        except Exception as error:
            print(f'[demo] cannot start: {error}', flush=True)
            traceback.print_exc()
            QTimer.singleShot(200, mw.close)
            return
        # Keep the driver and its pump referenced for the whole pass: the
        # generator, the waiters and every QTimer callback hang off them.
        state['driver'] = driver
        state['pump'] = Pump(driver.run(), driver.finish_pass, driver.fatal)
        # Anki-side steps reach the pump through the driver to fail the shot
        # they belong to when a condition they armed never materializes.
        driver.pump = state['pump']
        state['pump'].start()

    QTimer.singleShot(300, poll)
