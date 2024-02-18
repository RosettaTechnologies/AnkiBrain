from anki.models import NoteType
from anki.notes import Note
from aqt import mw


def add_basic_card(front_text: str, back_text: str, deck_name='AnkiBrain', tags: list[str] = None):
    col = mw.col

    deck_id = col.decks.id(deck_name)
    col.decks.select(deck_id)

    # Check if AnkiBrain-Basic exists; if not, create it
    model = col.models.by_name('AnkiBrain-Basic')
    if model is None:
        ab_basic_type = col.models.new('AnkiBrain-Basic')
        col.models.addField(ab_basic_type, col.models.new_field('Front'))
        col.models.addField(ab_basic_type, col.models.new_field('Back'))
        template = col.models.new_template('AnkiBrain-Basic-Template')
        template['qfmt'] = '{{Front}}'
        template['afmt'] = '{{Front}} <hr id="answer">{{Back}}</hr>'
        col.models.add_template(ab_basic_type, template)
        col.models.add(ab_basic_type)

    model = col.models.by_name('Ankibrain-Basic')
    model['did'] = deck_id
    col.models.set_current(model)
    col.models.save(model)

    fields = {'Front': front_text, 'Back': back_text}
    note = Note(col, model)
    for name, value in fields.items():
        note[name] = value

    note.tags = tags

    col.addNote(note)
    mw.ankiBrain.guiThreadSignaler.resetUISignal.emit()


def add_cloze_card(cloze_text: str, deck_name: str = 'AnkiBrain', tags: list[str] = None):
    col = mw.col

    deck_id = col.decks.id(deck_name)
    col.decks.select(deck_id)

    model = mw.col.models.by_name('AnkiBrain-Cloze')

    # Check if AnkiBrain-Cloze exists; if not, create it
    model = col.models.by_name('AnkiBrain-Cloze')
    if model is None:
        ab_cloze_type = col.models.new('AnkiBrain-Cloze')
        ab_cloze_type['type'] = 1 # Anki internally uses type=1 to refer to cloze type cards.

        col.models.addField(ab_cloze_type, col.models.new_field('Text'))
        col.models.addField(ab_cloze_type, col.models.new_field('Extra'))

        template = col.models.new_template('AnkiBrain-Cloze-Template')
        template['qfmt'] = '{{cloze:Text}}'
        template['afmt'] = '{{cloze:Text}}<br>{{Extra}}'

        ab_cloze_type['css'] = '''
        .card {
            font-family: arial;
            font-size: 20px;
            text-align: center;
            color: black;
            background-color: white;
        }
        .cloze {
             font-weight: bold;
             color: gold;
        }
        '''

        col.models.add_template(ab_cloze_type, template)
        col.models.add(ab_cloze_type)

    model = mw.col.models.by_name('AnkiBrain-Cloze')

    model['did'] = deck_id
    col.models.set_current(model)
    col.models.save(model)

    note = Note(col, model)
    note['Text'] = cloze_text
    note.tags = tags

    col.addNote(note)
    mw.ankiBrain.guiThreadSignaler.resetUISignal.emit()
