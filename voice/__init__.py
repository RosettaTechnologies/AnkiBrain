"""
AnkiBrain Voice package — Kokoro-82M local TTS engine integration.

Modules:
    state           shared path/status/manifest helpers (Anki-side)
    KokoroBootstrap  pinned, hash-verified bootstrap of the kokoro venv
    KokoroTTS/       the synthesis subprocess (runs in the kokoro venv itself)

The heavy lifting is deliberately NOT importable from the Anki process:
voice/KokoroTTS/__init__.py is executed by the venv's own interpreter via the
ExternalScriptManager stdin/stdout JSON protocol, exactly like ChatAI/.
"""
