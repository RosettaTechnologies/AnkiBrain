"""
AnkiBrain Voice — Kokoro TTS synthesis subprocess.

Executed by the kokoro venv interpreter (voice/../user_files/voice/venv) via
ExternalScriptManager, exactly like ChatAI/__init__.py: JSON commands in on
stdin, JSON responses on stdout, logs on stderr (the manager drains stderr to
logs/engine-stderr.log, so torch/transformers chatter never deadlocks us).

Commands
    SYNTH {text, voice?, speed?} -> {path, url, media_type, cached, duration_s}
    STATS                         -> {pipelines, audio_dir, kokoro_version}

WAVs are content-addressed under $ANKIBRAIN_TTS_DIR (state.VoicePaths.audio_dir,
inside user_files/media_tmp so the existing 7-day media_tmp GC covers them):
a repeat of the same (voice, speed, text) returns the cached file without
loading the model pipeline at all.

Paths come in via environment, never hardcoded:
    ANKIBRAIN_TTS_DIR  where to write WAVs   (engine_env from VoicePaths)
    HF_HOME            model cache          (pinned revision warm-up'd at install)
"""

import hashlib
import json
import os
import sys
import traceback
from os import path

SAMPLE_RATE = 24000
MAX_TEXT_CHARS = 6000
# ~150 ms of silence glued between split segments so paragraph/citation joins
# breathe instead of butting phonemes together.
SEGMENT_GAP_S = 0.15


def out(data):
    print(json.dumps(data))
    sys.stdout.flush()


def ok(cmd, data):
    out({'cmd': cmd, 'data': data})


def err(text):
    out({'cmd': 'SUBMODULE_ERROR', 'data': {'error': text}})


def log(*parts):
    print('[KokoroTTS]', *parts, file=sys.stderr, flush=True)


# lang_code -> (misaki extra that must be installed, human name)
LANG_REQUIREMENTS = {
    'j': ('misaki[ja]', 'Japanese voice pack'),
    'z': ('misaki[zh]', 'Chinese (Mandarin)'),
}


def load_manifest():
    """
    Runtime manifest lives next to this script's parent dir
    (voice/KokoroTTS/__file__ -> voice/runtime-manifest.json). Best-effort:
    an unreadable manifest falls back to voice-prefix lang codes + the public
    default repo.
    """
    try:
        manifest_path = path.join(path.dirname(path.dirname(path.abspath(__file__))), 'runtime-manifest.json')
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        log('manifest unreadable:', e)
        return {}


def voice_to_lang(manifest):
    return {name: lang for lang, entry in manifest.get('languages', {}).items()
            for name in entry.get('voices', [])}


class Engine:
    def __init__(self, manifest):
        model = manifest.get('model', {})
        self.default_voice = model.get('default_voice', 'af_heart')
        self.hf_repo = model.get('hf_repo', 'hexgrad/Kokoro-82M')
        self.default_speed = 1.0
        self._voice_lang = voice_to_lang(manifest)
        self._pipelines = {}
        self.imports = None  # lazily imported torch/numpy/soundfile/KPipeline

    def ensure_imports(self):
        if self.imports is None:
            import numpy
            import soundfile as sf
            import torch
            from kokoro import KPipeline
            self.imports = (numpy, sf, torch, KPipeline)
        return self.imports

    def voice_lang(self, voice):
        return self._voice_lang.get(voice) or (voice[0].lower() if voice else 'a')

    def pipeline(self, lang_code):
        if lang_code in self._pipelines:
            return self._pipelines[lang_code]
        _, _, _, KPipeline = self.ensure_imports()
        req = LANG_REQUIREMENTS.get(lang_code)
        try:
            log('building KPipeline for lang', lang_code)
            pipe = KPipeline(lang_code=lang_code, repo_id=self.hf_repo)
        except ImportError as e:
            label = req[1] if req else f'"{lang_code}"'
            raise RuntimeError(
                f'Voice language {label} needs extra G2P packages that are not '
                f'installed; add the language pack from Settings > Voice. ({e})'
            ) from e
        self._pipelines[lang_code] = pipe
        return pipe

    def synth(self, text, voice=None, speed=None):
        numpy, sf, torch, _ = self.ensure_imports()
        text = (text or '').strip()
        if not text:
            raise ValueError('Nothing to speak: empty text.')
        if len(text) > MAX_TEXT_CHARS:
            text = text[:MAX_TEXT_CHARS]

        voice = (voice or self.default_voice).strip()
        speed = float(speed or self.default_speed)
        lang_code = self.voice_lang(voice)

        audio_dir = os.environ.get('ANKIBRAIN_TTS_DIR')
        if not audio_dir:
            raise RuntimeError('ANKIBRAIN_TTS_DIR not set (manager bug?)')
        os.makedirs(audio_dir, exist_ok=True)

        key = hashlib.sha1(f'{voice}|{speed}|{text}'.encode('utf-8')).hexdigest()[:20]
        filename = f'kokoro-{voice}-{key}.wav'
        full = path.join(audio_dir, filename)
        if path.isfile(full) and os.path.getsize(full) > 44:
            return {'path': full, 'url': path_to_uri(full), 'media_type': 'audio/wav', 'cached': True, 'duration_s': None}

        pipe = self.pipeline(lang_code)
        segments = []
        # split_pattern=None lets Kokoro's own sentencer chunk long input.
        # Segments arrive as torch float32 tensors on CPU (24 kHz mono).
        for _, _, audio in pipe(text, voice=voice, speed=speed):
            segments.append(audio.detach().cpu() if hasattr(audio, 'detach') else audio)
        if not segments:
            raise RuntimeError('Kokoro produced no audio.')

        import torch
        gap = torch.zeros(int(SEGMENT_GAP_S * SAMPLE_RATE))
        joined = []
        for i, seg in enumerate(segments):
            joined.append(seg if hasattr(seg, 'float') else torch.as_tensor(seg, dtype=torch.float32))
            if i != len(segments) - 1:
                joined.append(gap)
        audio = torch.cat(joined).float().numpy() if joined else None

        # Atomic-ish write so a concurrent reader never sees a half file.
        # (.part extension: soundfile cannot infer format from it — set WAV.)
        tmp = full + '.part'
        sf.write(tmp, audio, SAMPLE_RATE, format='WAV')
        os.replace(tmp, full)
        return {
            'path': full,
            'url': path_to_uri(full),
            'media_type': 'audio/wav',
            'cached': False,
            'duration_s': round(len(audio) / SAMPLE_RATE, 2),
        }


def path_to_uri(pth):
    from pathlib import Path
    return Path(pth).as_uri()


if __name__ == '__main__':
    engine = Engine(load_manifest())

    # Import torch eagerly so the manager's ready-message timing reflects the
    # real startup cost (it is also what makes stderr draining matter).
    try:
        engine.ensure_imports()
        # Ready-line shape ExternalScriptManager.start() waits for.
        out({'status': 'success', 'data': {'default_voice': engine.default_voice}})
    except Exception as e:
        log('import failed:', traceback.format_exc())
        err(f'Kokoro engine failed to import: {e}')
        sys.exit(1)

    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            err(f'Invalid JSON input: {line[:120]}')
            continue

        cmd = req.get('cmd')
        try:
            if cmd == 'SYNTH':
                ok('DID_SYNTHESIZE_SPEECH', engine.synth(
                    req.get('text', ''),
                    voice=req.get('voice'),
                    speed=req.get('speed'),
                ))
            elif cmd == 'STATS':
                ok('DID_STATS', {
                    'pipelines': sorted(engine._pipelines.keys()),
                    'audio_dir': os.environ.get('ANKIBRAIN_TTS_DIR'),
                })
            elif cmd == 'PING':
                ok('PONG', {})
            else:
                err(f'Unknown command: {cmd}')
        except Exception as e:
            log('cmd failed:', traceback.format_exc())
            err(str(e))
