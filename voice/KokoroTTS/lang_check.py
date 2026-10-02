"""
Language-detection calibration + self-test for the Kokoro engine.

Run it with the engine's own interpreter (the one that has py3langid):

    user_files/voice/venv/bin/python voice/KokoroTTS/lang_check.py

Prints the full decision matrix (language, confidence, source, chosen voice)
and FAILS on cases whose expected outcome is unambiguous. When tuning the
thresholds in KokoroTTS/__init__.py, re-run this against the matrix and the
expected rows; the table is the calibration record.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from KokoroTTS import Engine, load_manifest  # noqa: E402

# (label, text, expected ISO code or None for "must abstain")
CASES = [
    ("en/sentence", "The quick brown fox jumps over the lazy dog.", "en"),
    ("en/phrase", "how are you", "en"),
    ("es/sentence", "La casa es grande y bonita.", "es"),
    ("es/phrase", "buenos días", "es"),
    ("fr/sentence", "Bonjour, comment ça va aujourd'hui ?", "fr"),
    ("it/sentence", "Il gatto è sul tavolo.", "it"),
    ("pt/sentence", "O gato está em cima da mesa.", "pt"),
    ("hi/script", "नमस्ते, आप कैसे हैं?", "hi"),
    ("zh/sentence", "你好，你今天好吗？", "zh"),
    ("ja/kana", "こんにちは、お元気ですか？", "ja"),
    ("ja/kana-word", "ありがとう", "ja"),
    ("zh/han-word", "谢谢", "zh"),
    ("ru/other-script", "Добрый день, как дела?", None),
    ("ar/other-script", "مرحبا كيف حالك؟", None),
    ("de/unsupported", "Guten Tag, wie geht es Ihnen?", None),
    ("junk/url", "https://example.com/path?q=1", None),
    ("junk/html", "<b>bold</b> &amp; <i>italic</i>", None),
    ("junk/number", "12345", None),
    ("es/single-word", "casa", None),
    ("fr/single-word", "merci", None),
    ("zh/han-single", "学", None),
]


def main():
    engine = Engine(load_manifest())
    print(f"{'label':<16} {'language':<8} {'conf':>7}  {'source':<8} {'voice':<10} expected")
    print("-" * 72)
    failures = []
    for label, text, expected in CASES:
        lang, conf, source = engine.detect_language(text)
        voice = engine.resolve_voice(engine.default_voice, lang)
        conf_s = f"{conf:.3f}" if conf is not None else "-"
        exp_s = expected if expected is not None else "abstain"
        ok = lang == expected
        if not ok:
            failures.append(label)
        print(f"{label:<16} {str(lang):<8} {conf_s:>7}  {source:<8} {voice:<10} "
              f"{exp_s}{'' if ok else '   <-- MISMATCH'}")

    print(f"\n{len(CASES) - len(failures)}/{len(CASES)} as expected")
    if failures:
        print("FAILED:", ", ".join(failures))
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
