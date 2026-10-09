# TTS Integration Expansion

## Context

AnkiBrain ships a local Kokoro TTS engine (`voice/` + `KokoroTTSAdapter.py`) reachable today from exactly four
places: the reviewer text-selection popup's **Speak** button, the side panel's chat speaker + Settings voice
preview, and the Make-Cards screen's per-field audio generation (which embeds `[sound:...]` tags only at
Add-to-Anki time via `cards.py::_tts_html`). Anki's own editing surfaces — card editor, browser, reviewer
context menu, batch operations — have no TTS at all, and the reviewer popup can only play, never persist.

This plan replaces the reviewer's Speak button with **Add Audio (Front)** / **Add Audio (Back)** (the button
labels itself from the section the selection came from and appends a `[sound:...]` tag to the note field it
came from), then extends the same engine into the card editor, the browser (batch generation with undo),
the main menu, and review-time automation (auto-speak; optional auto-fill of stored audio).

Everything new is Anki-side Python (Qt) reusing `KokoroTTSAdapter`; the webview bridge is used only to open
the existing Voice Setup modal and to render the new Settings controls. The Kokoro engine is **not**
registered as an Anki `{{tts}}` template-tag player (user decision: stored audio only).

Feature index (the requested list; each row is specified in the phase named):

| Feature | Phase |
|---|---|
| Add Audio (Front)/(Back) from a card selection, auto-labelled from the selection's section | 2 |
| Append `[sound:]` to the note field the selection came from; cloze answers redirected to the answer-only field | 2 |
| Immediate playback of what was just added + Anki undo support | 2 |
| Ctrl/Cmd-click on the popup button = speak without writing | 2 |
| Editor toolbar: add audio for the selection/focused field | 3 |
| Editor toolbar: speak the selection | 3 |
| Editor shortcuts Ctrl+Shift+A / Ctrl+Shift+S | 3 |
| Browser: batch "Add audio to selected notes" dialog (field checklist, voice, speed, skip/replace) | 4 |
| Browser: "Remove AnkiBrain audio" from selected notes | 4 |
| Deck browser: "add audio for this deck" | 4 |
| Batch progress dialog with cancel, single undo entry, summary | 1, 4 |
| Main menu: speak clipboard, stop speaking, pre-warm engine, engine setup, deck batch | 5 |
| Auto-speak during review (off/question/answer/both, optional per-deck filter) | 6 |
| Auto-fill missing stored audio on the answer side (off by default) | 6 |
| Reviewer context menu: speak this side | 6 |
| Pronunciation fixes: per-line `pattern => replacement` rules applied before synthesis | 1 |
| OGG note media (≈10× smaller than WAV) with automatic WAV fallback | 1 |
| Settings UI for all new keys + "clear cached audio" | 1, 5 |

## Approach

Phases are ordered so each is independently shippable and the named Add-Audio feature lands early. Phases 3–6
depend only on Phase 1; Phase 2 depends only on Phase 1.

---

### Phase 1 — Shared action layer

All new surfaces call one action layer; nothing below talks to the webview bridge except
`open_voice_setup()`.

**1.1 Engine: OGG note media.** `voice/KokoroTTS/__init__.py`
(`voice/runtime-manifest.json`/`uv.lock` are *not* touched, so no user re-download):

- `Engine.synth(self, text, voice=None, speed=None, auto=False, fmt='wav')`.
- Cache key becomes `sha1(f'{voice}|{speed}|{fmt}|{text}')`; filename `kokoro-{voice}-{key}.{fmt}`; the
  cached-hit branch returns `fmt` alongside the existing fields.
- For `fmt == 'ogg'`: `sf.write(tmp, audio, SAMPLE_RATE, format='OGG', subtype='VORBIS')`, and on
  `RuntimeError`/`sf.LibsndfileError` (libsndfile built without vorbis) retry with `format='WAV'` and
  report `fmt='wav'`. `media_type` follows the format actually written (`audio/ogg` / `audio/wav`).
- `SYNTH` dispatch passes `fmt=req.get('format') or 'wav'`; `STATS` gains `'ogg_supported'`
  (`'OGG' in sf.available_formats()`, computed inside `try/except` after `ensure_imports()`).

**1.2 Adapter.** `KokoroTTSAdapter.py`:

- `synth(self, text, voice=None, speed=None, auto=None, fmt='wav')` — adds `'format': fmt` to the
  `SYNTH` call payload; `speak_clean(..., fmt='wav')` forwards it. Existing bridge callers keep the default.
- New `async def synth_clip(self, text, *, voice=None, speed=None, fmt=None) -> dict | None`: `fmt=None` →
  `mw.settingsManager.get('ttsMediaFormat') or 'ogg'`; returns `None` for empty text. Text arrives already
  prepared by the caller (1.3) — the adapter never cleans, which keeps `tts_actions` importable from the
  adapter's callers without an import cycle.

**1.3 New root module `tts_actions.py`** — helpers only, no Qt widgets:

- `class TtsClip` (`dataclass`): `path, media_type, fmt, duration_s, voice, cached`.
- `def prepare_text(text, is_cloze=False) -> str` — `clean_text_for_speech(text, is_cloze=is_cloze)` then
  the user's replacement rules, in order. **Every item built in Phases 2–6 stores `prepare_text` output**, so
  the job runner and the adapter always receive final text.
- `def match_field_by_text(note, text) -> str | None` — the note field whose `prepare_text(value,
  is_cloze=True)` contains `normalize(prepare_text(text, is_cloze=True))`, ties broken by shortest field text
  then field order; `None` when nothing matches (used by the editor, which has no card side).
- `def parse_text_rules(raw) -> list[tuple[re.Pattern, str]]` — one rule per line, `pattern => replacement`
  (first `=>` splits), `#` starts a comment, blank lines ignored, invalid regex skipped with a `print`.
- `def template_fields(fmt: str) -> set[str]` — regex `\{\{[#^/]?\s*([A-Za-z0-9_]+)` over the template,
  dropping the specials `FrontSide, Tags, Deck, Subdeck, Card, CardFlag, Type, type, cloze, text, hint,
  tts, tts-voices, anki`.
- `def resolve_audio_target(note, template: dict, side: str, text: str) -> tuple[str, str]` — returns
  `(field_name, section)` with `section in ('Front', 'Back')`:
  1. `q_fields = template_fields(template['qfmt'])`, `a_fields = template_fields(template['afmt'])`.
  2. `needle = normalize(prepare_text(text, is_cloze=True))` (`normalize` = strip HTML/cloze via
     `clean_text_for_speech`, collapse whitespace, casefold). If `needle` is empty → skip to step 5.
  3. Candidates = fields whose `normalize(prepare_text(note[f], is_cloze=True))` contains `needle`.
     Sort by: (a) fields rendered on the shown side first (`a_fields` when `side == 'answer'`, else
     `q_fields`), then (b) shortest normalized field text, then (c) note field order.
  4. If candidates exist → first candidate.
  5. Else fallback: `side == 'question'` → first field in `q_fields` (by note field order, else first field
     of the note); `side == 'answer'` → first field in `a_fields - q_fields` (else the note's last field).
  6. Cloze redirect: if `note.note_type()['type'] == anki.models.MODEL_CLOZE` and the chosen field is in
     `q_fields` and its value contains `{{c` → replace it with the first field in `a_fields - q_fields`
     (typically `Back Extra`); if there is none, keep the chosen field.
  7. Section: field in `q_fields` xor `a_fields` → the side it appears on; field in both → the shown side
     (`'answer'` → `'Back'`, else `'Front'`).
- `def field_text_for_audio(note, field) -> str` — `prepare_text(note[field], is_cloze=note.note_type()['type']
  == MODEL_CLOZE)` (`MODEL_CLOZE` imported from `anki.models`).
- `def append_sound_tag(note, field, media_name, replace=False) -> bool` — when `replace`, first remove
  `[sound:kokoro-…]` tags from the field; append `'[sound:' + media_name + ']'`; set `note[field]`; return
  whether the value changed.
- `def strip_kokoro_audio(note) -> int` — removes `[sound:kokoro-…]` from every field; returns the count.
- `def store_clip(clip) -> str` — `mw.col.media.add_file(clip.path)` (content-hashed names ⇒ Anki reuses
  the existing media entry for identical text).
- `def play_clip(clip) -> None` — `from aqt.sound import av_player; av_player.play_file(clip.path)` guarded
  by `os.path.isfile`.
- `def open_voice_setup(mode=None) -> None` — `mw.ankiBrain.reactBridge.send_to_js({'cmd': 'ttsSetupRequired'})`
  plus `'mode': 'add_ja'` when `mode` is given (existing side-panel handler).
- `def speak_now(text) -> None` — one play-only job through 1.4.

**1.4 New root module `tts_jobs.py`** — the only place that writes notes:

- `@dataclass AudioJobItem`: `text: str`, `note_id: int | None = None`, `field: str | None = None`,
  `replace: bool = False`, `silent: bool = False`, `label: str = ''`,
  `guard: Callable[[], bool] | None = None`. `note_id is None` ⇒ play-only (speak, never write); `text` is
  always already prepared by the caller.
- `class TtsJobRunner(QObject)` with signals `itemFinished(dict)`, `progress(int, int)`, `finished(dict)`:
  - `def start(self, items, *, undo_name='AnkiBrain: add audio') -> bool` — refuses (returns `False`) while
    a job is running. Resolves `voice`/`speed`/`auto` once from settings (`ttsVoice` falling back to
    `vstate.read_manifest()['model']['default_voice']`, `ttsSpeed` → `1.0`, `ttsAutoDetect` → `True`).
  - `def cancel(self)` — sets a flag; the in-flight synthesis finishes, its result is discarded, remaining
    items are counted as cancelled.
  - `_step()` runs one item: `asyncio.run_coroutine_threadsafe(self._app.tts.synth_clip(item.text,
    voice=..., speed=...), self._app.loop)` with
    `fut.add_done_callback(lambda f: self._synthDone.emit(f))`; a single `pyqtSignal(object)` carries the
    future back to the Qt main thread (never blocks the UI thread).
  - `_on_synth_done(fut)` (main thread): evaluate `item.guard` (falsy ⇒ count skipped, do not write/play);
    `TTSNotInstalledError` ⇒ `open_voice_setup()`, abort the job with `error='TTS_NOT_INSTALLED'`;
    `TTSUnsupportedError` ⇒ abort with the reason; a `TTS_PACK_MISSING` message ⇒
    `open_voice_setup('add_ja')` and abort; any other exception ⇒ count failed, remember
    `first_error`, continue. On success: play-only ⇒ `play_clip`; else
    `media = store_clip(clip)`, `note = mw.col.get_note(item.note_id)` (missing note ⇒ skipped),
    `append_sound_tag(...)`, lazily create the undo entry before the first write
    (`self._undo_id = mw.col.add_custom_undo_entry(undo_name)`), `mw.col.update_note(note)`, then play the
    clip unless `item.silent`. Emit `itemFinished` + `progress`, then `_step()`.
  - `_finish()`: `mw.col.merge_undo_entries(self._undo_id)` when an entry was created; emit `finished` with
    `{'generated', 'failed', 'skipped', 'cancelled', 'first_error'}`.
- `def run_single(parent, item, *, on_done=None) -> TtsJobRunner` — `mw.progress.start(label='AnkiBrain
  voice: generating audio…', immediate=True)` + `mw.progress.finish()` on `finished`; no separate dialog, but a
  250 ms `QTimer` polls `mw.progress.want_cancel()` → `runner.cancel()` (a cold engine start can take tens of
  seconds, so the user must be able to back out).
- `def run_with_progress(parent, items, *, title, undo_name='AnkiBrain: add audio', on_done=None) -> TtsJobRunner`
  — window-modal `QProgressDialog` (`setRange(0, len(items))`, label `title`, "3/12 — Note 1523 · Back"),
  cancel button → `runner.cancel()`; closes on `finished`.
- One runner per app: `self.ttsJobs = TtsJobRunner()` created in `AnkiBrain.__init__` next to `self.tts`.
  `run_single`/`run_with_progress` drive that instance; when `start()` returns `False` they show
  `tooltip('AnkiBrain is already generating audio.')` and return without touching the collection.

**1.5 Settings.** `settings.py` `default_settings` gains (with the file's usual one-line comments):

```python
'ttsMediaFormat': 'ogg',      # ogg | wav — note media format (ogg falls back to wav automatically)
'ttsTextRules': '',           # one 'pattern => replacement' per line, applied before synthesis
'ttsKeepWarm': False,         # skip the 15-minute idle unload so the first speak is instant
'ttsAutoSpeak': 'off',        # off | question | answer | both — speak the shown side in the reviewer
'ttsAutoSpeakDecks': [],      # deck ids; empty = every deck
'ttsAutoFill': False,         # append stored audio to the answer side's fields during review
```

`KokoroTTSAdapter._idle_unload_loop` skips unloading while `ttsKeepWarm` is true.

**1.6 Settings UI + cache clearing.** `webview/src/api/redux/slices/tts.js` `initialState.settings` gains the
same six keys with the same defaults. `SettingsScreen.jsx` Voice block gains: media-format select, "Keep voice
engine warm" switch, "Auto-speak in review" select, "Auto-fill missing audio on the answer side" switch,
"Pronunciation fixes" textarea (placeholder `Kokoro => Kokoro Desu`, one rule per line), and a "Clear cached
audio" button. Each control persists with the existing pattern (`editTtsSettingLocal({key, value})` +
`pyEditSetting(key, value)`). `ttsAutoSpeakDecks` deliberately has no Settings control — it is toggled from
the deck browser's `AnkiBrain: auto-speak in this deck` menu action (Phase 4).

Cache clearing adds the command pair `TTS_CLEAR_CACHE` / `DID_TTS_CLEAR_CACHE` to **both**
`InterprocessCommand.py` and `webview/src/api/PythonBridge/InterprocessCommand.js`, a sender
`webview/src/api/PythonBridge/senders/pyTtsClearCache.js`, and a `ReactBridge` handler that
`await self.app.tts.stop()`s, counts files in `self.app.tts.paths().audio_dir`, then
`shutil.rmtree(..., ignore_errors=True)` + `os.makedirs(..., exist_ok=True)`, replying
`{'ok': True, 'removed': n}`.

---

### Phase 2 — Reviewer: "Add Audio (Front|Back)" replaces Speak

**2.1** `card_injection.py`:

- `generate_card_injection_content(show_card_bottom_hint=True, kind='')` emits
  `window.ankiBrainCardKind = <json.dumps(kind)>;` **outside** the `ankiBrainCardListenersAdded` guard so it
  is re-set on every render (the reviewer page persists across cards).
- `sendSelectedText()` adds `kind: window.ankiBrainCardKind` to the `pycmd` payload.
- `handle_card_will_show(text, card, kind)` records `LAST_CARD_BY_KIND[kind] = card` and passes `kind=` into
  the generator; module-level `def card_for_kind(kind)` returns the stored card or `None`.

**2.2** `ExplainTalkButtons.py`:

- `__init__(self, parent, position, audio_label: str | None = 'Add Audio')`; `speakButton` becomes
  `audioButton` (text `audio_label`) and `on_speak_button_click` becomes `on_audio_button_click`.
- `audio_label is None` (template-editor preview) ⇒ the button is not created and the widget is
  `QSize(220, 60)`; otherwise `QSize(310, 60)`. Button size/style unchanged (90×40).

**2.3** New root module `tts_reviewer.py`:

- `def audio_target_for(kind, text) -> tuple[str, str] | None` — `card_for_kind(kind)`, then
  `mw.col.get_note(card.nid)` and `resolve_audio_target(note, card.template(),
  'question' if kind.endswith('Question') else 'answer', text)`; `None` when the card is unknown.
- `def on_add_audio(text, kind) -> None` — resolve the target; on `None` `tooltip('AnkiBrain: could not read
  that card.')`. Otherwise `run_single(None, AudioJobItem(text=prepare_text(text, is_cloze=note.note_type()['type']
  == MODEL_CLOZE), note_id=note.id, field=field, label=f'Note {note.id} · {field}'), on_done=…)`; the done
  handler shows `tooltip(f'Audio added to "{field}"')`, or the runner's error path (setup modal / pack modal /
  first_error).

**2.4** `AnkiBrainModule.py`:

- `handle_text_selected` stores `self.selectedCardKind = data.get('kind')` and resolves
  `target = tts_reviewer.audio_target_for(kind, text)` (a `(field, section)` tuple or `None`); computes
  `label = None if str(kind).startswith('clayout') or target is None else 'Add Audio (%s)' % target[1]`;
  constructs `ExplainTalkButtons(parent_win, win_pos, audio_label=label)` and wires
  `on_audio_button_click(self.handle_add_audio_pressed)`. `label is None` hides the button (Explain/Talk still
  work) rather than offering a dead control — that covers the template editor and any webview that never
  rendered a card.
- `handle_add_audio_pressed()`: capture `text = self.selectedText`, `kind = self.selectedCardKind`, destroy
  the popup, clear `selectedText`; when `QGuiApplication.keyboardModifiers() &
  Qt.KeyboardModifier.ControlModifier` (Cmd on macOS) → `asyncio.run_coroutine_threadsafe(
  self.reactBridge.speak_text(text), self.loop)` (unchanged speak-only path); else
  `tts_reviewer.on_add_audio(text, kind)`.
- `handle_speak_text_pressed` stays (only reached through the modifier path).
- Dismissal on card change (`handle_card_changed`/`handle_mousedown`) is unchanged.

Behaviour notes: the button label is computed at selection time from template membership + field-text match,
and re-resolved at click time from the freshly loaded note. The inserted tag takes effect on the next show of
that card; the clip is played immediately through `av_player` as feedback.

---

### Phase 3 — Card editor integration

**3.1** New root module `tts_editor.py`:

- `def on_editor_init_buttons(buttons, editor) -> list[str]`:

```python
buttons.append(editor.addButton(icon=None, cmd='ankibrainTTSAddAudio', func=_add_audio,
                                tip='AnkiBrain: add audio for the selection (Ctrl+Shift+A)',
                                label='🔊', keys='ctrl+shift+a', disables=False))
buttons.append(editor.addButton(icon=None, cmd='ankibrainTTSSpeak', func=_speak,
                                tip='AnkiBrain: speak the selection (Ctrl+Shift+S)',
                                label='▶', keys='ctrl+shift+s', disables=False))
```

- `def _note(editor)` — legacy `getattr(editor, 'note', None)` (Editor) else
  `mw.col.get_note(editor.nid)` (NewEditor); `None` when `editor.nid` is falsy.
- `def _field(editor, note)` — `editor.currentField` index into `note.keys()`, else `note.keys()[0]`.
- `def _selection(editor, cb)` — `editor.web.evalWithCallback('window.getSelection().toString()', cb)`.
- `def _add_audio(editor)` — no note ⇒ `tooltip('AnkiBrain: no note is open.')`; selection empty ⇒ use the
  field's text; both empty ⇒ `tooltip('Nothing to speak in this field.')`. Target field =
  `match_field_by_text(note, selection) or _field(editor, note)` (a selection made in another field must not
  write to the focused one). Then `run_single(editor.widget, AudioJobItem(text=prepare_text(selection_or_field,
  is_cloze=…), note_id=note.id, field=field, label=f'Note {note.id} · {field}'), on_done=…)` whose handler
  calls `_reload(editor)` and `tooltip(f'Audio added to "{field}"')`.
- `def _speak(editor)` — selection (else field text) ⇒ `speak_now(text)`; empty ⇒ the same tooltip.
- `def _reload(editor)` — `getattr(editor, 'reload_note', None) or editor.loadNote`, called after a write so
  the new `[sound:]` tag is visible.
- Registration in `AnkiBrain.setup_ui`:
  `gui_hooks.editor_did_init_buttons.append(tts_editor.on_editor_init_buttons)`.

No editor context-menu items: the SvelteKit editor has no add-on context-menu hook, and both editors must
behave identically. `addButton` registers the shortcuts itself in both editors, and both wrap the handler
with `call_after_note_saved`, so the note is already saved when the handler runs.

---

### Phase 4 — Browser batch + deck

**4.1** New root module `tts_batch.py` with `class TtsBatchDialog(QDialog)`:

- `__init__(self, parent, note_ids: Sequence[int] | None, deck_id: int | None = None)`; when `deck_id` is
  given, `note_ids = mw.col.find_notes(f'deck:"{mw.col.decks.name(deck_id)}"')`.
- Header label: `f'{len(note_ids)} notes selected'` or `f'Deck: {name} ({len(note_ids)} notes)'`.
- Field checklist: the union of field names across the selected notes' note types, each entry labelled
  `f'{name} ({count} notes)'`; **default-checked** = fields referenced by any template of those note types
  (`template_fields(tmpl['qfmt']) | template_fields(tmpl['afmt'])` for every `tmpl` in `notetype['tmpls']`).
- Options: voice combo (manifest voices for installed packs, default `ttsVoice`), speed
  `QDoubleSpinBox(0.5–2.0, step 0.05, default ttsSpeed)`, checkbox "Skip fields that already contain audio"
  (default on), checkbox "Replace existing AnkiBrain audio" (default off, disabled while "skip" is on),
  "Preview" button (first built item as a play-only job), OK/Cancel.
- `_build_items()`: per note × checked field present in the note — skip empty `field_text_for_audio`
  (cloze-aware); skip when `'[sound:' in value` and skip-on; `replace` when replace-on;
  `label=f'Note {note.id} · {field}'`. More than 2000 notes ⇒ confirm with `askUser` first.
- Run: `run_with_progress(self, items, title=f'AnkiBrain voice: adding audio ({len(items)} fields)',
  undo_name='AnkiBrain: add audio', on_done=summary)`; summary via `showInfo`:
  `f'Added audio to {generated} fields in {notes} notes (skipped {skipped}, failed {failed}).'`
- `def remove_ankibrain_audio(parent, note_ids)` — confirm with `askUser` above 20 notes, one undo entry,
  `strip_kokoro_audio` per note + `col.update_note`, `tooltip(f'Removed AnkiBrain audio from {n} notes.')`.

**4.2** Menu registration in `tts_batch.py`:

- `def on_browser_context_menu(browser, menu)` — submenu `AnkiBrain Voice` with
  `Add audio to selected notes…` and `Remove AnkiBrain audio from selected notes`.
- `def on_deck_browser_menu(menu, deck_id)` — two actions: `AnkiBrain: add audio for this deck…` opening
  `TtsBatchDialog(None, None, deck_id=deck_id)`, and a checkable `AnkiBrain: auto-speak in this deck` whose
  checked state is `deck_id in mw.settingsManager.get('ttsAutoSpeakDecks')`; toggling adds/removes the id and
  persists the list with `mw.settingsManager.edit('ttsAutoSpeakDecks', ids)`.

**4.3** Register in `AnkiBrain.setup_ui`:
`gui_hooks.browser_will_show_context_menu.append(tts_batch.on_browser_context_menu)` and
`gui_hooks.deck_browser_will_show_options_menu.append(tts_batch.on_deck_browser_menu)`.

---

### Phase 5 — Menu + global actions

Add to `AnkiBrain.setup_ui` through the existing `add_ankibrain_menu_item` helper:

- `Voice: Speak clipboard` → `tts_actions.speak_now(QGuiApplication.clipboard().text())`
- `Voice: Stop speaking` → `from aqt.sound import av_player; av_player.stop_and_clear_queue()`
- `Voice: Pre-warm engine` → `asyncio.run_coroutine_threadsafe(self.tts.start(), self.loop)`, tooltip
  `Voice engine ready.` (or `Voice engine is already running.` when the process is alive); engine absent ⇒
  `open_voice_setup()`
- `Voice: Add audio for current deck…` → `TtsBatchDialog(None, None, deck_id=mw.col.decks.current()['id'])`
- `Voice: Engine setup…` → `open_voice_setup()`

---

### Phase 6 — Review-time automation

All in `tts_reviewer.py`; every job is a play-only or silent job so nothing is written without the user's
`ttsAutoFill` opt-in.

- `def on_did_show_question(card)` / `def on_did_show_answer(card)`:
  1. `self._gen += 1`; `gen = self._gen`.
  2. Read `ttsAutoSpeak` (`off|question|answer|both`) and `ttsAutoSpeakDecks`; skip when off, or when the
     deck list is non-empty and `card.did` is not in it.
  3. Side text = the note's fields referenced by that side's template (`card.template()['qfmt']` for the
     question, `['afmt']` for the answer), in note field order, non-empty, `prepare_text`d, joined with
     `'\n\n'`; skip when empty.
  4. Skip when `(card.id, side, text)` equals the last spoken triple.
  5. `run_single(None, AudioJobItem(text=text, silent=True,
     guard=lambda: gen == self._gen and mw.reviewer.card is not None and mw.reviewer.card.id == card.id,
     label=f'Card {card.id} · {side}'))` — the guard discards the clip when the reviewer already moved on.
- `def on_reviewer_context_menu(reviewer, menu)` — `AnkiBrain: speak this side` running the same path with
  the mode check bypassed.
- Auto-fill (`ttsAutoFill` on, **answer side only** so a question can never be spoiled): build silent items
  for the answer side's fields that do not already contain `[sound:`, with the same generation guard, plus a
  per-session `set` of filled note ids to avoid repeats; on completion
  `tooltip('Audio added to this note (plays next time)')`. Nothing is played by the auto-fill path.
- Register in `AnkiBrain.setup_ui`: `reviewer_did_show_question`, `reviewer_did_show_answer`,
  `reviewer_will_show_context_menu` (appending to the existing `reviewer_did_show_question` registration
  that dismisses the selection popup).

## Critical files & anchors

- `KokoroTTSAdapter.py` — `synth`/`speak_clean`/`_idle_unload_loop`; every new surface funnels through it.
- `card_injection.py` — the injected selection script is the only source of the selection's `kind`; Phase 2
  depends on it end to end.
- `ExplainTalkButtons.py` — the popup widget being relabelled; fixed sizes must change with the button count.
- `AnkiBrainModule.py` — hook registration in `setup_ui`, popup wiring in `handle_text_selected`, and the new
  menu items all live here.
- `settings.py` — new keys must also be mirrored into the webview's `tts` slice defaults or the Settings
  screen renders `undefined`.

## Verification

No Python tests exist and the addon runs in-process: **restart Anki from a terminal** (`anki`) after each
phase and watch stdout. Webview changes additionally need `cd webview && yarn build` (and `yarn lint`).

1. **Engine format** — with the voice engine installed (Settings → Voice), run
   `user_files/voice/venv/bin/python -c "import soundfile as sf; print('OGG' in sf.available_formats())"`.
   Then add audio for one field and confirm the tag references a `.ogg` file in `collection.media`; if the
   probe printed `False`, expect `.wav` instead and no other behaviour change.
2. **Phase 2** — review a Basic note; select text on the front: the popup reads `Add Audio (Front)`; click it:
   audio plays, tooltip names the field, and the editor shows `[sound:kokoro-….ogg]` appended to `Front`.
   Anki's Undo (Edit → Undo) removes it. Flip the card, select back text → `Add Audio (Back)` → tag lands in
   `Back`. Ctrl-click speaks without changing the note. On a cloze note, selecting text on the question side
   must label `Add Audio (Back)` and append to `Back Extra`, never to `Text`.
3. **Phase 3** — in the editor select a word, press Ctrl+Shift+A: the field reloads with the tag; Ctrl+Shift+S
   speaks; with the selection empty the whole field is synthesized; Ctrl+Shift+A on an empty field shows the
   "Nothing to speak" tooltip.
4. **Phase 4** — browser: select ~20 notes → `AnkiBrain Voice → Add audio to selected notes…` → progress
   dialog counts up, Cancel mid-run leaves the finished items in place, and Edit → Undo is a single
   `AnkiBrain: add audio` step. Re-run with "skip fields that already contain audio" → `skipped` equals the
   field count. `Remove AnkiBrain audio` deletes the tags (and leaves hand-made audio alone).
5. **Phase 5** — speak clipboard, stop speaking, pre-warm (tooltip) and the deck batch from the deck browser.
6. **Phase 6** — set `ttsAutoSpeak = both`, review several cards: each side speaks once; pressing Space
   immediately after a show must not play stale audio. Turn on `ttsAutoFill`: the answer side gains
   `[sound:…]` tags, no playback happens, and re-showing the card plays the stored audio through Anki's own
   reviewer.
7. **Regression** — the side panel's chat speaker, Settings voice preview, Make-Cards generate-audio flow and
   `ADD_TTS_AUDIO`/`speak_text` still work (they share `KokoroTTSAdapter`).

## Assumptions & contingencies

- **OGG write support** is unverified (the voice venv is not installed on this machine). The engine probe +
  WAV fallback in 1.1 is the whole contingency: if OGG is unavailable, everything still works with `.wav`
  note media; no other step changes.
- **Reviewer re-render on note update**: if Anki re-renders the current card when its note changes, the new
  `[sound:]` tag auto-plays and the explicit `play_clip` would double up. Verify in step 2; if it happens, set
  `silent=True` for the reviewer write path only (the tag's own playback is the feedback).
- **`addButton` behaviour** is identical on both editors shipped in Anki 26.9.3 (`Editor` legacy is the
  default; `NewEditor` is behind the SvelteKit experiment flag). If a future Anki changes the signature,
  Phase 3 degrades to no toolbar buttons; the rest of the plan is unaffected.
- **Ctrl/Cmd-click = speak-only** is the only way to keep the old Speak behaviour; the button itself always
  writes.
- **Auto-speak/auto-fill default off**, `ttsMediaFormat` default `ogg`, `ttsKeepWarm` default off.
- **Batch size**: the dialog confirms above 2000 notes; there is no resumable queue — a cancelled run keeps
  what it finished (all under one undo entry).
