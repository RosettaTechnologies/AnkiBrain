def generate_card_injection_content(show_card_bottom_hint=True):
    out = """
    <script>
        function getSelectedTextPosition(selection) {
            if (!selection.rangeCount) {
                return null;
            }

            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            return {
                x: rect.left + window.scrollX,
                y: rect.bottom + window.scrollY
            };
        }

        document.addEventListener('mouseup', function() {
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
            pycmd(JSON.stringify({
                cmd: 'mousedown',
            }));
        });
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
