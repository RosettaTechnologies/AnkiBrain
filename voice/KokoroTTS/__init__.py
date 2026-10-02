"""
AnkiBrain Voice — Kokoro TTS synthesis subprocess.

Executed by the kokoro venv interpreter (voice/../user_files/voice/venv) via
ExternalScriptManager, exactly like ChatAI/__init__.py: JSON commands in on
stdin, JSON responses on stdout, logs on stderr (the manager drains stderr to
logs/engine-stderr.log, so torch/transformers chatter never deadlocks us).

Commands
    SYNTH {text, voice?, speed?, auto?} -> {path, url, media_type, cached, duration_s,
                                            voice, language, language_confidence,
                                            language_source}
    DETECT {text} -> {language, confidence, source}   (debug/calibration)
    STATS                         -> {pipelines, audio_dir, detector}

With `auto: true` the engine detects the text's source language (script pass +
py3langid, restricted to languages the installed voices can speak) and swaps
to a first voice of that language; `voice` then acts as the fallback used for
uncertain/unsupported text. Detection runs before the WAV cache lookup, so a
repeated (text, resolved voice) pair still hits the cache. A detected Japanese
text whose pack is not installed raises 'TTS_PACK_MISSING:<voice>' so the
Anki side can open the add-pack flow.

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
import unicodedata
from os import path

SAMPLE_RATE = 24000
MAX_TEXT_CHARS = 6000
# ~150 ms of silence glued between split segments so paragraph/citation joins
# breathe instead of butting phonemes together.
SEGMENT_GAP_S = 0.15

# ── Automatic language detection (SYNTH auto) ───────────────────────────────
# Kokoro voices are language-specific: the pipeline is chosen by the voice's
# first letter. With `auto: true` the engine detects the text's language and
# swaps to the first catalog voice of that language. Thresholds were
# calibrated against py3langid 0.4.0 normalized probabilities (see
# voice/KokoroTTS/lang_check.py to re-run the matrix): sentences land at
# 0.6-1.0, two-word phrases at 0.2-0.9, while single words are usually
# < 0.2 and often plain wrong — hence the two-tier bars.
MIN_LANG_CONFIDENCE_PHRASE = 0.20   # >= 2 word tokens
MIN_LANG_CONFIDENCE_SINGLE = 0.50   # exactly 1 word token
MIN_DETECT_ALPHA = 3                # fewest alphabetic chars worth classifying
MIN_HAN_CHARS = 2                   # fewest Han-only ideographs worth classifying
DETECT_CACHE_MAX = 256

# ISO 639-1 codes the installed voices can speak. yue/wuu (Chinese variants)
# are read with the Mandarin pipeline; everything else is unsupported and the
# engine keeps the requested voice rather than forcing a near-neighbor.
SUPPORTED_ISO = {'en', 'es', 'fr', 'hi', 'it', 'pt', 'zh', 'ja'}
ZH_VARIANTS = {'yue', 'wuu'}
ISO_TO_KOKORO = {'en': 'a', 'es': 'e', 'fr': 'f', 'hi': 'h',
                 'it': 'i', 'pt': 'p', 'zh': 'z', 'ja': 'j'}


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


def _script_counts(text):
    """
    Cheap per-character script census (letters only). unicodedata.name is
    consulted only for characters outside the CJK/Devanagari ranges.
    """
    counts = {'kana': 0, 'han': 0, 'devanagari': 0, 'latin': 0, 'other': 0}
    for ch in text:
        if not ch.isalpha():
            continue
        cp = ord(ch)
        if 0x3040 <= cp <= 0x30FF or 0x31F0 <= cp <= 0x31FF or 0xFF66 <= cp <= 0xFF9D:
            counts['kana'] += 1
        elif (0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF
              or 0xF900 <= cp <= 0xFAFF or 0x20000 <= cp <= 0x2FA1F):
            counts['han'] += 1
        elif 0x0900 <= cp <= 0x097F:
            counts['devanagari'] += 1
        elif unicodedata.name(ch, '').startswith('LATIN'):
            counts['latin'] += 1
        else:
            counts['other'] += 1
    return counts


def ja_pack_available():
    """True when the Japanese pack (pyopenjtalk) is importable in this venv."""
    import importlib.util
    return importlib.util.find_spec('pyopenjtalk') is not None


class Engine:
    def __init__(self, manifest):
        model = manifest.get('model', {})
        self.default_voice = model.get('default_voice', 'af_heart')
        self.hf_repo = model.get('hf_repo', 'hexgrad/Kokoro-82M')
        self.default_speed = 1.0
        self._voice_lang = voice_to_lang(manifest)
        self._first_voice = {lang: entry['voices'][0]
                             for lang, entry in manifest.get('languages', {}).items()
                             if entry.get('voices')}
        self._pipelines = {}
        self.imports = None  # lazily imported torch/numpy/soundfile/KPipeline
        self._identifier = None            # lazily imported py3langid model
        self._detector_unavailable = False
        self._detect_cache = {}

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

    # ───────────────────────── language detection ─────────────────────────

    def _load_identifier(self):
        """
        Lazy py3langid load (first auto synthesis). A missing package means
        the add-on updated ahead of the engine — auto degrades to the
        requested voice until the user runs the voice engine update, and we
        log once instead of failing every request.
        """
        if self._identifier is not None or self._detector_unavailable:
            return self._identifier
        try:
            from py3langid.langid import LanguageIdentifier, MODEL_FILE
            self._identifier = LanguageIdentifier.from_model_file(
                MODEL_FILE, norm_probs=True, min_confidence=0.0)
            log('language detector loaded')
        except Exception as e:
            self._detector_unavailable = True
            log('language detector unavailable (run the voice engine update to enable it):', e)
        return self._identifier

    def detect_language(self, text):
        """
        Best-effort source-language detection restricted to languages the
        installed voices can speak.

        Returns (iso_code|None, confidence|None, source) where source is
        'script' (deterministic script pass), 'langid' (statistical) or
        'abstain'. See the threshold comment at the top of the file for the
        calibration rationale.
        """
        text = (text or '').strip()
        if not text:
            return None, None, 'abstain'
        cached = self._detect_cache.get(text)
        if cached is not None:
            return cached

        counts = _script_counts(text)
        kana, han = counts['kana'], counts['han']
        dev, latin, other = counts['devanagari'], counts['latin'], counts['other']

        result = (None, None, 'abstain')
        if kana:
            # Any kana is decisive; Han+kanji mixes cannot fool it.
            result = ('ja', 1.0, 'script')
        elif dev and dev >= latin:
            # Deviations from langid on Devanagari are real (common words are
            # answered Sanskrit); the script itself is trustworthy.
            result = ('hi', 1.0, 'script')
        elif other > latin:
            # A script the engine has no voices for (Cyrillic, Arabic, ...):
            # abstain instead of letting the model pick a Latin neighbor.
            result = (None, None, 'abstain')
        else:
            han_only = bool(han) and not latin and not dev
            if han_only:
                # Han-only text is zh/ja-ambiguous by nature; require at least
                # two characters, then let the model call it (zh wins almost
                # all Han-only text; kana presence above routes Japanese).
                min_conf = MIN_LANG_CONFIDENCE_PHRASE
                usable = han >= MIN_HAN_CHARS
            else:
                min_conf = (MIN_LANG_CONFIDENCE_SINGLE if len(text.split()) <= 1
                            else MIN_LANG_CONFIDENCE_PHRASE)
                usable = (kana + han + dev + latin + other) >= MIN_DETECT_ALPHA
            ident = self._load_identifier() if usable else None
            if ident is not None:
                try:
                    # rank() is sorted; break at the first candidate below the
                    # bar. First supported/mapped language above it wins.
                    for iso, prob in ident.rank(text):
                        if prob < min_conf:
                            break
                        if iso in ZH_VARIANTS:
                            result = ('zh', prob, 'langid')
                            break
                        if iso in SUPPORTED_ISO:
                            result = (iso, prob, 'langid')
                            break
                except Exception as e:
                    log('language detection failed:', e)

        # Memoize; short texts are the repeat-prone ones worth keeping.
        if len(text) <= 200:
            if len(self._detect_cache) >= DETECT_CACHE_MAX:
                self._detect_cache.clear()
            self._detect_cache[text] = result
        return result

    def resolve_voice(self, requested, iso):
        """
        Pick the voice for a detected ISO language. The requested voice is
        kept when the languages already match (English: both a/b voices
        count); otherwise the language's first catalog voice is used.
        """
        code = ISO_TO_KOKORO.get(iso) if iso else None
        if not code:
            return requested
        current = self.voice_lang(requested)
        if current == code or (iso == 'en' and current in ('a', 'b')):
            return requested
        return self._first_voice.get(code) or requested

    # ────────────────────────────── synthesis ─────────────────────────────

    def synth(self, text, voice=None, speed=None, auto=False):
        numpy, sf, torch, _ = self.ensure_imports()
        text = (text or '').strip()
        if not text:
            raise ValueError('Nothing to speak: empty text.')
        if len(text) > MAX_TEXT_CHARS:
            text = text[:MAX_TEXT_CHARS]

        voice = (voice or self.default_voice).strip()
        speed = float(speed or self.default_speed)

        language, confidence, lang_source = (None, None, 'disabled')
        if auto:
            language, confidence, lang_source = self.detect_language(text)
            voice = self.resolve_voice(voice, language)
            log('auto: lang=%s conf=%s src=%s -> voice=%s'
                % (language,
                   '%.3f' % confidence if confidence is not None else '-',
                   lang_source, voice))
        lang_code = self.voice_lang(voice)

        audio_dir = os.environ.get('ANKIBRAIN_TTS_DIR')
        if not audio_dir:
            raise RuntimeError('ANKIBRAIN_TTS_DIR not set (manager bug?)')
        os.makedirs(audio_dir, exist_ok=True)

        key = hashlib.sha1(f'{voice}|{speed}|{text}'.encode('utf-8')).hexdigest()[:20]
        filename = f'kokoro-{voice}-{key}.wav'
        full = path.join(audio_dir, filename)
        meta = {
            'voice': voice,
            'language': language,
            'language_confidence': round(confidence, 4) if confidence is not None else None,
            'language_source': lang_source,
        }
        if path.isfile(full) and os.path.getsize(full) > 44:
            return dict(meta, path=full, url=path_to_uri(full),
                        media_type='audio/wav', cached=True, duration_s=None)

        if lang_code == 'j' and not ja_pack_available():
            # Auto-detected Japanese without the pack (explicit ja voices are
            # gated Anki-side first): the Anki side maps this sentinel to the
            # incremental add-pack modal instead of a raw error.
            raise RuntimeError(f'TTS_PACK_MISSING:{voice}')

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
        return dict(meta,
                    path=full,
                    url=path_to_uri(full),
                    media_type='audio/wav',
                    cached=False,
                    duration_s=round(len(audio) / SAMPLE_RATE, 2))


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
                    auto=bool(req.get('auto')),
                ))
            elif cmd == 'DETECT':
                lang, conf, src = engine.detect_language(req.get('text', ''))
                ok('DID_DETECT', {'language': lang, 'confidence': conf, 'source': src})
            elif cmd == 'STATS':
                ok('DID_STATS', {
                    'pipelines': sorted(engine._pipelines.keys()),
                    'audio_dir': os.environ.get('ANKIBRAIN_TTS_DIR'),
                    'detector': {
                        'loaded': engine._identifier is not None,
                        'unavailable': engine._detector_unavailable,
                        'cached': len(engine._detect_cache),
                    },
                })
            elif cmd == 'PING':
                ok('PONG', {})
            else:
                err(f'Unknown command: {cmd}')
        except Exception as e:
            log('cmd failed:', traceback.format_exc())
            err(str(e))
