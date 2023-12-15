from anki.notes import Note
from aqt import mw


def add_basic_card(front_text: str, back_text: str, deck_name='AnkiBrain', tags: list[str] = None):
    deck_id = mw.col.decks.id(deck_name)
    mw.col.decks.select(deck_id)

    model = mw.col.models.by_name('Basic')
    model['did'] = deck_id
    mw.col.models.set_current(model)
    mw.col.models.save(model)

    fields = {'Front': front_text, 'Back': back_text}
    note = Note(mw.col, model)
    for name, value in fields.items():
        note[name] = value

    note.tags = tags

    mw.col.addNote(note)
    mw.ankiBrain.guiThreadSignaler.resetUISignal.emit()


def add_cloze_card(cloze_text: str, deck_name: str = 'AnkiBrain', tags: list[str] = None):
    deck_id = mw.col.decks.id(deck_name)
    mw.col.decks.select(deck_id)

    model = mw.col.models.by_name('Cloze')
    model['did'] = deck_id
    mw.col.models.set_current(model)
    mw.col.models.save(model)

    note = Note(mw.col, model)
    note['Text'] = cloze_text
    note.tags = tags

    mw.col.addNote(note)
    mw.ankiBrain.guiThreadSignaler.resetUISignal.emit()
