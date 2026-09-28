def generate_card_injection_content(show_card_bottom_hint=True):
    out = """
    <script>
        function getSelectedTextPosition(selection) {
            if (!selection.rangeCount) {
                return null;
            }

            const range = selection.getRangeAt(0);
            // Use the LAST client rect of the range instead of the union
            // getBoundingClientRect(): for a selection that spans several lines
            // the union rect covers whole lines and would anchor the popup far
            // away from where the user stopped selecting.
            const rects = range.getClientRects();
            const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
            // Viewport coordinates (no scroll offsets): the webview widget's
            // top-left is the viewport's top-left, so python maps these directly
            // through the webview to position the Explain/Talk popup.
            return {
                x: rect.left,
                y: rect.bottom
            };
        }

        // Modern Anki (the SvelteKit review screen) loads the reviewer page once and
        // re-runs the card's <script> tags for every question/answer shown. Without
        // this guard, each card would stack another set of listeners and fire pycmd
        // multiple times per highlight.
        if (!window.ankiBrainCardListenersAdded) {
            window.ankiBrainCardListenersAdded = true;

            // The Explain/Talk popup is triggered from 'selectionchange', not
            // 'mouseup': during a click-and-drag selection QtWebEngine's native
            // selection handling can swallow the mouse release before the page
            // sees it, while the selection itself always settles through
            // selectionchange. This also covers double-click, shift-click and
            // keyboard selection.
            //
            // The timer is scoped to this guarded block so it persists across
            // the per-card script re-runs. It debounces ~1 char-per-event
            // selection churn (a drag) into a single pycmd once the selection
            // settles.
            let selectionTimer = null;

            function sendSelectedText() {
                selectionTimer = null;
                if (typeof pycmd !== 'function') return;
                const selection = window.getSelection();
                if (!selection) return;
                const text = selection.toString();
                if (text === '') return;

                pycmd(JSON.stringify({
                    cmd: 'selectedText',
                    text: text,
                    position: getSelectedTextPosition(selection),
                }));
            }

            document.addEventListener('selectionchange', function() {
                if (selectionTimer !== null) {
                    clearTimeout(selectionTimer);
                }
                selectionTimer = setTimeout(sendSelectedText, 250);
            });

            document.addEventListener('mousedown', function() {
                // A new press cancels any popup the debounce timer is about to
                // raise, then tells python to dismiss the current one.
                if (selectionTimer !== null) {
                    clearTimeout(selectionTimer);
                    selectionTimer = null;
                }
                if (typeof pycmd !== 'function') return;
                pycmd(JSON.stringify({
                    cmd: 'mousedown',
                }));
            });
        }
    </script>
    """
    if show_card_bottom_hint:
        out = """
            <p style="color: gray; font-size: 12px;">
            Highlight any text on this card to interact with AnkiBrain
            </p>
        """ + out

    return out


def handle_card_will_show(text: str, card: "Card", kind: str) -> str:
    from aqt import mw
    show_card_bottom_hint = mw.settingsManager.get('showCardBottomHint')
    return text + generate_card_injection_content(show_card_bottom_hint=show_card_bottom_hint)
