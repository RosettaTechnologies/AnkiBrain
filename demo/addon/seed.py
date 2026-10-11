"""
Deterministic collection seeding for the demo base.

The hero deck-list shot should look like a real collection: an AnkiBrain deck
plus a couple of ordinary decks with plausible notes. Everything here is
idempotent, so re-running a pass never duplicates notes.
"""

from aqt import mw

SEED_DECKS = {
    'Pharmacology': [
        ('What is the mechanism of action of beta blockers?',
         'Competitive blockade of beta-1 adrenergic receptors, lowering heart rate and contractility.'),
        ('Which drug classes are first line for stable angina?',
         'Beta blockers, calcium channel blockers, and nitrates.'),
        ('What does the acronym ACE stand for?',
         'Angiotensin-converting enzyme.'),
        ('What is the antidote for warfarin overdose?',
         'Vitamin K (phytonadione), plus fresh frozen plasma when there is active bleeding.'),
    ],
    'Spanish': [
        ('How do you say "the cat is on the table"?',
         'El gato está en la mesa.'),
        ('What is the preterite form of "ir" for yo?',
         'Fui.'),
        ('How do you ask "where is the bathroom?"',
         '¿Dónde está el baño?'),
        ('What does "mañana" mean?',
         'Tomorrow, or morning, depending on context.'),
    ],
}


def seed_collection():
    """Add the filler decks. Returns the number of notes added."""
    basic = mw.col.models.by_name('Basic')
    if basic is None:
        raise RuntimeError('the demo collection has no Basic notetype')
    added = 0
    for deck_name, notes in SEED_DECKS.items():
        deck_id = mw.col.decks.id(deck_name)
        existing = {mw.col.get_note(nid).fields[0]
                    for nid in mw.col.find_notes(f'deck:"{deck_name}"')}
        for front, back in notes:
            if front in existing:
                continue
            note = mw.col.new_note(basic)
            note['Front'] = front
            note['Back'] = back
            mw.col.add_note(note, deck_id)
            added += 1
    if added:
        mw.col.save()
    return added
