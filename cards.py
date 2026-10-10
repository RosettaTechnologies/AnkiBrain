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


# ── Image occlusion (built-in Anki Image Occlusion notetype, Anki 23.10+) ──

def _format_coord(value) -> str:
    """
    Normalized shape coordinate in the same format Anki's own IO editor
    writes (toFixed(4) with leading/trailing zeros stripped): 0.2325 ->
    '.2325', 0.5 -> '.5'. Coordinates are fractions of the image size
    (0..1), origin at the top-left corner.
    """
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f'Invalid occlusion coordinate: {value!r}')

    if number != number:  # NaN
        raise ValueError('Invalid occlusion coordinate (NaN)')

    if number == 0:
        return '.0000'

    text = f'{number:.4f}'
    text = text.lstrip('0')
    text = text.rstrip('0')
    return text or '.0000'


def _occlusion_shape_spec(occlusion: dict, occlude_inactive: bool = False) -> str:
    """
    One 'image-occlusion:' payload, e.g.
    'rect:left=.1:top=.2:width=.3:height=.1'. Grammar lives in
    rslib/src/image_occlusion/imageocclusion.rs (rect / ellipse / polygon).
    """
    shape = str(occlusion.get('shape') or 'rect').lower()
    parts = [shape]

    if shape == 'rect':
        for name in ('left', 'top', 'width', 'height'):
            parts.append(f'{name}={_format_coord(occlusion.get(name))}')
    elif shape == 'ellipse':
        for name in ('left', 'top', 'rx', 'ry'):
            parts.append(f'{name}={_format_coord(occlusion.get(name))}')
    elif shape == 'polygon':
        formatted = []
        for point in occlusion.get('points') or []:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise ValueError('Polygon points must be [x, y] pairs.')
            formatted.append(
                f'{_format_coord(point[0])},{_format_coord(point[1])}')
        if not formatted:
            raise ValueError('Polygon occlusion needs at least one point.')
        parts.append('points=' + ' '.join(formatted))
    else:
        raise ValueError(f'Unsupported occlusion shape: {shape!r}')

    if occlude_inactive or occlusion.get('occludeInactive'):
        parts.append('oi=1')

    return ':'.join(parts)


def add_image_occlusion_card(image_path: str, occlusions: list, header: str = '',
                             back_extra: str = '', tags: list[str] = None,
                             deck_name: str = 'AnkiBrain',
                             occlude_inactive: bool = False):
    """
    Add a native Anki image-occlusion note: one note per image, one card per
    ordinal (shapes sharing an ordinal land on the same card).

    Anki's backend does the heavy lifting: it copies the image into the
    collection media folder, maps the fields by tag (robust to renames and
    localization) and creates the built-in 'Image Occlusion' notetype when
    missing (notetype_id=0). The note lands in the currently selected deck,
    same as the basic/cloze adders. Requires Anki 23.10+.
    """
    col = mw.col

    if not hasattr(col, 'add_image_occlusion_note'):
        raise Exception('Image occlusion cards require Anki 23.10 or newer.')

    if not image_path or not os.path.isfile(image_path):
        raise FileNotFoundError(
            'The image for this occlusion card is no longer available. '
            'Re-import it and try again.')

    blocks = []
    for occlusion in occlusions or []:
        if not isinstance(occlusion, dict):
            continue
        try:
            ordinal = int(occlusion.get('ordinal') or 1)
        except (TypeError, ValueError):
            ordinal = 1
        if ordinal < 1:
            ordinal = 1
        spec = _occlusion_shape_spec(occlusion, occlude_inactive=occlude_inactive)
        blocks.append(f'{{{{c{ordinal}::image-occlusion:{spec}}}}}<br>')

    if not blocks:
        raise Exception('This occlusion card has no shapes; nothing to add.')

    deck_id = col.decks.id(deck_name or 'AnkiBrain')
    col.decks.select(deck_id)

    col.add_image_occlusion_note(
        0,  # 0 -> Anki finds (or creates) the built-in Image Occlusion notetype
        image_path,
        ''.join(blocks),
        header or '',
        back_extra or '',
        list(tags or []),
    )
