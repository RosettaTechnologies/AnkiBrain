"""
Named Anki-side steps for the demo pipeline.

Each step is `handler(driver, arg)`. Steps run on the GUI thread from the
driver's generator. Anything that has to happen *later* — a modal Qt dialog, a
debounced JS round trip, a popup that only appears after a selection settles —
is polled with a QTimer and registered as a pending wait on the driver, so the
driver does not capture until every armed condition has materialized. A
condition that never materializes throws into the generator and fails the shot
instead of silently capturing the wrong state.

Returning a QWidget tells a `capture.target: dialog` shot which widget to
capture.
"""

import json
from os import path

from aqt import mw
from aqt.qt import *

DEMO_DECK = 'AnkiBrain Demo'


class SkipStep(Exception):
    """Raised by a step the environment cannot satisfy: recorded as a skipped
    shot (with the reason) rather than a failure."""


# ── pending-wait plumbing ───────────────────────────────────────────────────

def _pump(driver):
    return getattr(driver, 'pump', None)


def _throw(driver, message):
    pump = _pump(driver)
    if pump is None:
        print(f'[demo] step failure outside a run: {message}', flush=True)
        return
    pump.throw(RuntimeError(message))


def _arm(driver, describe):
    """Register a pending condition the driver must let settle before it
    captures. Returns a token the poller marks as done; the driver marks it
    `cancelled` when the shot it belongs to is over, so a poller that is still
    ticking (a file dialog that never appeared, a popup that never showed)
    cannot fail the *next* shot."""
    token = {'describe': describe, 'done': False, 'error': None, 'cancelled': False}
    pending = getattr(driver, 'pending_waits', None)
    if pending is not None:
        pending.append(token)
    return token


def _finish(token, error=None):
    token['done'] = True
    token['error'] = error


def wait_for(driver, describe, predicate, timeout_ms=6000, interval_ms=100, then=None):
    """Poll `predicate` on the GUI thread; fail the shot when it never holds.

    `then` runs once the predicate holds, before the token is finished: that is
    how a step chains waits (settle, then select, then read back), which it
    cannot do by calling `wait_for` twice in a row."""
    token = _arm(driver, describe)
    state = {'elapsed': 0}

    def tick():
        if token['cancelled']:
            return
        try:
            if predicate():
                if then is not None:
                    then()
                _finish(token)
                return
        except Exception as error:
            _finish(token, str(error))
            _throw(driver, f'{describe}: {error}')
            return
        state['elapsed'] += interval_ms
        if state['elapsed'] >= timeout_ms:
            message = f'timed out after {timeout_ms} ms waiting for {describe}'
            _finish(token, message)
            _throw(driver, message)
            return
        QTimer.singleShot(interval_ms, tick)

    QTimer.singleShot(interval_ms, tick)


# ── collection lookups ──────────────────────────────────────────────────────

def _demo_notes():
    for note_id in mw.col.find_notes(f'deck:"{DEMO_DECK}"'):
        yield mw.col.get_note(note_id)


def find_demo_card(kind):
    """First card of the first demo note matching `kind`."""
    for note in _demo_notes():
        name = (note.note_type() or {}).get('name', '')
        fields = ' '.join(note.fields)
        if kind == 'basic' and name == 'AnkiBrain-Basic':
            pass
        elif kind == 'cloze' and name == 'AnkiBrain-Cloze':
            pass
        elif kind == 'occlusion' and 'Image Occlusion' in name:
            pass
        elif kind == 'audio' and '[sound:' in fields:
            pass
        else:
            continue
        card_ids = mw.col.card_ids_of_note(note.id)
        if card_ids:
            return card_ids[0]
    return None


# ── collection state ────────────────────────────────────────────────────────

def seed_collection(driver, arg):
    from .seed import seed_collection as seed

    added = seed()
    print(f'[demo] seed_collection: {added} notes added', flush=True)


def refresh_decks(driver, arg):
    """Re-render the deck browser after the collection changed.

    The deck list only refreshes on user actions, so the seeded decks and the
    cards the shots add would not show up. `refresh()` reloads the shared main
    webview asynchronously, so this waits for the table to be back: a capture
    taken right after the call would catch a blank page."""
    if mw.state != 'deckBrowser':
        raise SkipStep(f'not on the deck browser (state {mw.state!r})')
    mw.deckBrowser.refresh()
    # One evaluation at a time: the callback is asynchronous, so clearing the
    # slot on every tick would drop the answer of a slow one.
    state = {'inflight': False, 'value': None}

    def rendered():
        if state['value'] is True:
            return True
        if state['inflight']:
            return False
        state['inflight'] = True

        def done(value):
            state['inflight'] = False
            state['value'] = value
        mw.web.page().runJavaScript(
            "document.querySelectorAll('table tr').length >= 2", done)
        return False

    wait_for(driver, 'deck list re-rendered', rendered, timeout_ms=8000)


def deck_browser(driver, arg):
    """Back to the deck list: the reviewer stays open after a shot that showed
    a card, and the main window's half of the later shots should show the
    collection rather than a leftover card."""
    mw.moveToState('deckBrowser')
    mw.deckBrowser.refresh()


def unsuspend_demo_cards(driver, arg):
    suspended = getattr(driver, 'reviewer_suspended', None) or []
    if suspended:
        mw.col.sched.unsuspend_cards(suspended)
        driver.reviewer_suspended = []
        mw.col.save()


# ── reviewer ────────────────────────────────────────────────────────────────

def open_reviewer(driver, arg):
    """Show the reviewer on a specific demo card.

    The reviewer displays the current deck's queue and `moveToState('review')`
    takes no card id in this Anki, so the target's siblings are suspended (and
    restored by the `anki_after` step) to make it the card that comes up.
    """
    kind = (arg or 'basic').strip() or 'basic'
    deck_id = mw.col.decks.id(DEMO_DECK)
    card_id = find_demo_card(kind)
    if card_id is None:
        raise SkipStep(f'no {kind} card in deck {DEMO_DECK!r}')
    siblings = [cid for cid in mw.col.find_cards(f'deck:"{DEMO_DECK}"') if cid != card_id]
    if siblings:
        mw.col.sched.suspend_cards(siblings)
    driver.reviewer_suspended = siblings
    mw.col.decks.select(deck_id)
    mw.col.save()
    mw.moveToState('review')

    def showing():
        card = getattr(mw.reviewer, 'card', None)
        return mw.state == 'review' and card is not None and card.id == card_id

    wait_for(driver, f'reviewer showing the {kind} card {card_id}', showing)
    if mw.state != 'review':
        raise SkipStep(f'the reviewer did not open (state {mw.state!r}); '
                       f'is there a {kind} card due in {DEMO_DECK!r}?')
    return None


# ── card webview ────────────────────────────────────────────────────────────

_SELECT_CARD_TEXT_JS = """(function(){
  const limit = %d;
  const container = document.getElementById('qa');
  if (!container) return JSON.stringify({ok: false, error: '#qa container missing'});
  // The *lowest* long text node: the hint line AnkiBrain prepends and the
  // card's own first line would otherwise anchor the popup over the text, and
  // a card template splits its front into several text nodes.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node;
  let target = null;
  let lowest = -1;
  while ((node = walker.nextNode())) {
    if ((node.nodeValue || '').trim().length < 15) continue;
    const probe = document.createRange();
    probe.selectNodeContents(node);
    const probeRects = probe.getClientRects();
    const bottom = probeRects.length
      ? probeRects[probeRects.length - 1].bottom
      : probe.getBoundingClientRect().bottom;
    if (bottom > lowest) {
      lowest = bottom;
      target = node;
    }
  }
  if (!target) {
    return JSON.stringify({ok: false, error: 'no text node long enough to select'});
  }
  const value = target.nodeValue || '';
  const trimmed = value.trim();
  const start = Math.max(0, value.indexOf(trimmed.slice(0, 10)));
  const end = Math.min(value.length, start + limit);
  const range = document.createRange();
  range.setStart(target, start);
  range.setEnd(target, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rects = range.getClientRects();
  const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  return JSON.stringify({
    ok: true,
    text: selection.toString(),
    x: rect.left,
    y: rect.bottom,
  });
})()"""


def _card_page_loaded(webview, stable_needed=8):
    """Predicate for `wait_for`: the card page is rendered *and* settled.

    The reviewer loads the legacy page, renders the card into `#qa`, and then
    re-renders once more when the collection operation that opened it lands
    (`mw.reset()`); a selection made before that is dropped without ever firing
    the card's selectionchange handler. Requiring the ready state - card text,
    the card's own listener flag and a usable `pycmd` - to hold across a few
    polls is what makes the selection stick."""
    state = {'inflight': False, 'stable': 0}

    def done(value):
        state['inflight'] = False
        state['stable'] = state['stable'] + 1 if value is True else 0

    def loaded():
        if state['stable'] >= stable_needed:
            return True
        if state['inflight']:
            return False
        state['inflight'] = True
        webview.page().runJavaScript(
            "(function(){ const qa = document.getElementById('qa');"
            " return !!window.ankiBrainCardListenersAdded && typeof pycmd === 'function'"
            " && !!qa && (qa.innerText || '').trim().length > 20; })()", done)
        return False

    return loaded


def card_webview():
    """The webview showing the card.

    Anki 26 renders the deck browser, the reviewer and the overview in one
    shared main webview (`mw.web`); `Reviewer.web` is left over from the
    previous layout and holds no card page (no `#qa`, no `pycmd`)."""
    web = getattr(mw, 'web', None)
    if web is None:
        raise SkipStep('this Anki has no main webview')
    return web


def select_card_text(driver, arg):
    """Highlight card text and raise the Explain/Talk/Speak popup.

    The selection is a real DOM range. The popup is then raised by calling the
    add-on's own selection handler with the payload the card's injected script
    would send: the pycmd bridge that normally carries it does not fire under
    Anki 26's SvelteKit reviewer (the card's selectionchange handler runs while
    `pycmd` is still undefined). The popup, its buttons and their actions are
    the real ones."""
    chars = int(arg or '60')
    webview = card_webview()

    def popup_raised():
        wait_for(driver, 'Explain/Talk/Speak popup after the selection',
                 lambda: getattr(mw.ankiBrain, 'explainTalkButtons', None) is not None,
                 timeout_ms=5000)

    def use_payload(value):
        data = json.loads(value) if isinstance(value, str) else {}
        if not data.get('ok'):
            _throw(driver, f"could not select card text: {data.get('error')}")
            return
        mw.ankiBrain.handle_text_selected(
            text=data['text'],
            position={'x': data['x'], 'y': data['y']},
            context=None)
        popup_raised()

    def select_text():
        webview.page().runJavaScript(_SELECT_CARD_TEXT_JS % chars, use_payload)

    wait_for(driver, 'card page rendered and settled', _card_page_loaded(webview),
             timeout_ms=10000, then=select_text)


def dismiss_popup(driver, arg):
    """Destroy the Explain/Talk/Speak popup (and its selection) after a shot
    that raised it: it is a child widget of the main window, so it would
    otherwise sit over the next shot's surface."""
    mw.ankiBrain.handle_mousedown()


# ── file picker ─────────────────────────────────────────────────────────────

def answer_file_dialog(driver, arg):
    """Arm a poller that answers the next Qt file dialog with `arg`.

    The panel opens the picker from a Python handler that runs a nested modal
    loop, so this poller (armed *before* the panel step that clicks the picker)
    fires inside that loop; the app's own handler then does the rest.
    """
    target = (arg or '').strip()
    if not target:
        raise RuntimeError('answer_file_dialog needs a path')
    if not path.isfile(target):
        raise SkipStep(f'fixture missing: {target}')
    token = _arm(driver, f'file dialog answered with {path.basename(target)}')
    state = {'elapsed': 0, 'named': False, 'seen': False}

    def tick():
        if token['cancelled']:
            return
        widget = QApplication.activeModalWidget()
        dialog = widget if isinstance(widget, QFileDialog) and widget.isVisible() else None
        if dialog is not None:
            state['seen'] = True
            if not state['named']:
                state['named'] = True
                print(f'[demo] answering the file dialog with {target}', flush=True)
                dialog.selectFile(target)
            # PyQt6 refuses QDialog.accept() on a dialog Qt created itself
            # (the static getOpenFileNames helper owns it), so the slot is
            # reached through the meta-object. Repeated while the dialog is up,
            # because accept() only lands once the dialog is visible.
            if QMetaObject.invokeMethod(dialog, 'accept') is False:
                print('[demo] could not invoke accept() on the file dialog', flush=True)
            QTimer.singleShot(100, tick)
            return
        if state['seen']:
            # The dialog is gone: the app's own handler has the selection.
            _finish(token)
            return
        state['elapsed'] += 100
        if state['elapsed'] >= 15000:
            message = ('no QFileDialog appeared within 15 s '
                       '(is a native/portal file dialog in use?)')
            _finish(token, message)
            _throw(driver, message)
            return
        QTimer.singleShot(100, tick)

    QTimer.singleShot(100, tick)
