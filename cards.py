import os

from anki.models import NoteType
from anki.notes import Note
from aqt import mw


def _images_html(image_paths: list) -> str:
    """
    Add each image file to the collection media folder and build the HTML.
    Anki dedupes identical media by checksum, and our files are content-hash
    named, so repeated images across cards only ever store once.
    """
    if not image_paths:
        return ''

    col = mw.col
    tags = []
    for image_path in image_paths:
        if not os.path.isfile(image_path):
            # Image store was GC'd or the path was tampered with; skip, but
            # still add the card.
            print(f'(cards) Image file no longer available, skipping: {image_path}')
            continue
        try:
            media_name = col.media.add_file(image_path)
        except Exception as e:
            print(f'(cards) Could not add media file {image_path}: {e}')
            continue
        tags.append(f'<img src="{media_name}">')

    return ''.join(tags)


def _tts_html(audio_paths: list) -> str:
    """
    Kokoro TTS audio, answer/question side per the caller. [sound:...] is
    Anki's native media tag: the reviewer shows the speaker button and
    auto-plays when the side is displayed. Like images, files are
    content-hashed so identical sentences across cards share one media entry.
    """
    if not audio_paths:
        return ''

    col = mw.col
    tags = []
    for audio_path in audio_paths:
        if not os.path.isfile(audio_path):
            print(f'(cards) TTS audio no longer available, skipping: {audio_path}')
            continue
        try:
            media_name = col.media.add_file(audio_path)
        except Exception as e:
            print(f'(cards) Could not add TTS media file {audio_path}: {e}')
            continue
        tags.append(f'[sound:{media_name}]')

    return ''.join(tags)


def add_basic_card(front_text: str, back_text: str, deck_name='AnkiBrain', tags: list[str] = None,
                   image_paths: list = None, front_audio_paths: list = None,
                   back_audio_paths: list = None):
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

    model = col.models.by_name('AnkiBrain-Basic')
    model['did'] = deck_id
    col.models.set_current(model)
    col.models.save(model)

    # Images always go on the answer side only, never the question side.
    # Audio rides on whichever sides carry clips the review screen generated
    # (the card's own media_tmp ids) — nothing is synthesized at add time.
    images_html = _images_html(image_paths)
    if images_html:
        back_text = f'{back_text}<br>{images_html}'
    front_text = f'{front_text}{_tts_html(front_audio_paths)}'
    back_text = f'{back_text}{_tts_html(back_audio_paths)}'

    fields = {'Front': front_text, 'Back': back_text}
    note = Note(col, model)
    for name, value in fields.items():
        note[name] = value

    note.tags = tags

    col.addNote(note)
    mw.ankiBrain.guiThreadSignaler.resetUISignal.emit()


def add_cloze_card(cloze_text: str, deck_name: str = 'AnkiBrain', tags: list[str] = None,
                   image_paths: list = None, audio_paths: list = None):
    # The cloze template renders {{cloze:Text}} on BOTH card sides, so images
    # never go into Text. 'Extra' is the answer-side-only field (afmt shows it
    # after the question), which keeps images hidden until the card is flipped.
    # TTS audio lives there too — it speaks the RESOLVED sentence, which would
    # spoil the blank if it played on the question side.
    extra_html = _images_html(image_paths) + _tts_html(audio_paths)

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
    if extra_html:
        note['Extra'] = extra_html
    note.tags = tags

    col.addNote(note)
    mw.ankiBrain.guiThreadSignaler.resetUISignal.emit()
