import base64
import hashlib
import os
import shutil
import time
import uuid
from os import path
from pathlib import Path

from project_paths import user_data_dir

"""
Storage bridge between card generation (which discovers images in documents)
and Anki's collection media folder.

Extracted images are written to user_files/media_tmp/<run-id>/ with
content-hash filenames. Card JSON crossing the JS<->Python bridge only ever
carries image *ids* (the 'run-id/filename' relative path); full bytes never
cross the bridge.
"""

MEDIA_TMP_DIR = path.join(user_data_dir, 'media_tmp')

EXT_BY_MEDIA_TYPE = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
}
DEFAULT_EXT = 'png'


def _ext_for(media_type: str) -> str:
    return EXT_BY_MEDIA_TYPE.get((media_type or '').lower(), DEFAULT_EXT)


def store_image_bytes(data: bytes, media_type: str, run_id: str = None) -> dict:
    """
    Write image bytes into the media_tmp store. Returns
    {'id', 'path', 'url', 'mediaType'}.
    """
    if run_id is None:
        run_id = uuid.uuid4().hex[:8]

    digest = hashlib.sha1(data).hexdigest()[:12]
    filename = f'ankibrain-{digest}.{_ext_for(media_type)}'
    run_dir = path.join(MEDIA_TMP_DIR, run_id)
    os.makedirs(run_dir, exist_ok=True)

    full_path = path.join(run_dir, filename)
    if not path.isfile(full_path):
        with open(full_path, 'wb') as f:
            f.write(data)

    return {
        'id': f'{run_id}/{filename}',
        'path': full_path,
        'url': Path(full_path).as_uri(),
        'mediaType': media_type,
    }


def store_server_split_images(images: list) -> list:
    """
    Convert the ankibrain-server /document/split image payload (base64) into
    on-disk entries for the webview. The base64 never reaches the JS layer.
    """
    run_id = uuid.uuid4().hex[:8]
    out = []
    for image in images:
        if not isinstance(image, dict):
            continue
        try:
            data = base64.b64decode(image.get('dataBase64') or '')
        except Exception as e:
            print(f'(media_images) Skipping undecodable image: {e}')
            continue

        if not data:
            continue

        try:
            entry = store_image_bytes(data, image.get('mediaType', 'image/png'), run_id)
        except Exception as e:
            print(f'(media_images) Failed writing image to media_tmp: {e}')
            continue

        out.append({
            'id': entry['id'],
            'url': entry['url'],
            'mediaType': image.get('mediaType', 'image/png'),
            'anchorChunk': image.get('anchorChunk'),
        })

    return out


def _resolve_within_media_tmp(rel_id):
    """
    Resolve a media_tmp-relative id to an absolute on-disk path, guarding
    against path traversal. Returns None when the file is missing (e.g.
    purged by GC).
    """
    if not isinstance(rel_id, str) or rel_id == '':
        return None

    base = path.abspath(MEDIA_TMP_DIR)
    candidate = path.abspath(path.join(base, rel_id))
    if candidate != base and not candidate.startswith(base + path.sep):
        return None

    return candidate if path.isfile(candidate) else None


def resolve_image_path(image_id: str):
    """
    Resolve a media_tmp image id to an absolute path, guarding against path
    traversal. Returns None when the file is missing (e.g. purged by GC).
    """
    return _resolve_within_media_tmp(image_id)


MEDIA_TYPE_BY_EXT = {ext: mime for mime, ext in EXT_BY_MEDIA_TYPE.items()}


def resolve_image_entry(image_id: str):
    """
    Resolve a media_tmp image id to an imagesRegistry descriptor
    {'id', 'url', 'mediaType'}, or None when the file is gone. Used to
    re-hydrate previews for cards restored from tempCards after a restart,
    while the media_tmp files themselves live (see cleanup_media_tmp).
    """
    resolved = resolve_image_path(image_id)
    if resolved is None:
        return None

    ext = path.splitext(resolved)[1].lower().lstrip('.')
    return {
        'id': image_id,
        'url': Path(resolved).as_uri(),
        'mediaType': MEDIA_TYPE_BY_EXT.get(ext, 'image/png'),
    }


def resolve_card_image_paths(card: dict) -> list:
    """
    Resolve a card's 'images' id list to on-disk paths, skipping missing files.
    """
    image_ids = card.get('images') or []
    paths = []
    if isinstance(image_ids, list):
        for image_id in image_ids:
            resolved = resolve_image_path(image_id)
            if resolved is not None:
                paths.append(resolved)
            else:
                print(f'(media_images) Image no longer available, skipping: {image_id}')
    return paths


def resolve_audio_path(audio_id: str):
    """
    Resolve a media_tmp tts id (e.g. 'tts/kokoro-af_heart-<hash>.wav') to an
    absolute path, or None when the file is gone.
    """
    return _resolve_within_media_tmp(audio_id)


def resolve_audio_entry(audio_id: str):
    """
    Resolve a media_tmp tts id to an audioRegistry descriptor {'id', 'url',
    'mediaType'}, or None when the file is gone. Mirrors resolve_image_entry:
    used to re-hydrate play/remove UI for cards restored from tempCards.
    """
    resolved = resolve_audio_path(audio_id)
    if resolved is None:
        return None

    return {
        'id': audio_id,
        'url': Path(resolved).as_uri(),
        'mediaType': 'audio/wav',
    }


def resolve_card_audio(card: dict) -> dict:
    """
    Map a card's 'audio' dict ({'front'|'back': media_tmp id}) to on-disk
    paths, skipping missing files with the same graceful policy as images
    (cards.py's _tts_html double-guards). Returns {'front': [...], 'back':
    [...]}; cloze cards only ever use 'back' (the audio rides on Extra so it
    never spoils the blank).
    """
    resolved = {'front': [], 'back': []}
    audio = card.get('audio') or {}
    if not isinstance(audio, dict):
        return resolved

    for side in ('front', 'back'):
        audio_id = audio.get(side)
        if not audio_id:
            continue
        p = resolve_audio_path(audio_id)
        if p is not None:
            resolved[side].append(p)
        else:
            print(f'(media_images) Card audio no longer available, skipping: {audio_id}')
    return resolved


def cleanup_media_tmp(max_age_days: int = 7):
    """
    Delete media_tmp run directories untouched for longer than max_age_days.
    Called at AnkiBrain startup.
    """
    if not path.isdir(MEDIA_TMP_DIR):
        return

    cutoff = time.time() - max_age_days * 24 * 60 * 60
    for entry in os.listdir(MEDIA_TMP_DIR):
        entry_path = path.join(MEDIA_TMP_DIR, entry)
        if not path.isdir(entry_path):
            continue
        try:
            if os.path.getmtime(entry_path) < cutoff:
                shutil.rmtree(entry_path, ignore_errors=True)
                print(f'(media_images) Cleaned expired image store: {entry}')
        except OSError:
            pass
