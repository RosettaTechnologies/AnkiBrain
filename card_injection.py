def generate_card_injection_content(show_card_bottom_hint=True):
    out = """
    <script>
        function getSelectedTextPosition(selection) {
            if (!selection.rangeCount) {
                return null;
            }

            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
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

            document.addEventListener('mouseup', function() {
                if (typeof pycmd !== 'function') return;
                const selection = window.getSelection();
                const text = selection.toString();
                if (!selection || text === '') return;

                pycmd(JSON.stringify({
                    cmd: 'selectedText',
                    text: selection.toString(),
                    position: getSelectedTextPosition(selection),
                }));
            });

            document.addEventListener('mousedown', function() {
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
