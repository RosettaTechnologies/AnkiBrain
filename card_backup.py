import json
import os
from datetime import datetime
from os import path

from project_paths import user_data_dir

# Single-slot durable snapshot of the card list handed to Add-to-Anki.
# Written before the first note is inserted and removed only once every note
# was added (or the user clears the list), so a crash mid-add leaves exactly
# one recoverable snapshot. Never accumulates.
BACKUP_DIR = path.join(user_data_dir, 'card_backups')


def pending_backup_path() -> str:
    return path.join(BACKUP_DIR, 'pending_add.json')


def write_pending_backup(cards: list, deck_name: str) -> None:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    payload = {
        'timestamp': datetime.now().isoformat(timespec='seconds'),
        'deckName': deck_name,
        'cards': cards,
    }
    target = pending_backup_path()
    tmp = target + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False)
    os.replace(tmp, target)


def read_pending_backup():
    try:
        with open(pending_backup_path(), 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get('cards'), list):
        return None
    return data


def clear_pending_backup() -> None:
    try:
        os.remove(pending_backup_path())
    except OSError:
        pass
