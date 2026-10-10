import hashlib
import os
import re
import uuid
from os import path
from pathlib import Path

"""
Document image extraction for LOCAL mode card generation.

Runs inside the ChatAI subprocess (own venv, sys.path is this directory).
Mirrors the server-mode extraction contract: extracted images are written to
user_files/media_tmp/<run-id>/ with content-hash filenames, and each image
carries an 'anchorChunk' index into the returned chunks so the webview can
attach images positionally to cards generated from that batch.
"""

MEDIA_TMP_DIR = path.join(
    path.abspath(path.dirname(__file__)), '..', 'user_files', 'media_tmp'
)

# Keep in sync with media_images.py and the server-side extraction limits.
MIN_IMAGE_DIMENSION = 100
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024
MAX_IMAGES_PER_PAGE = 6
MAX_IMAGES_PER_DOCUMENT = 200

MARKER_REGEX = re.compile(r'\{\{AB_IMG:(\d+)\}\}')

EXT_BY_MEDIA_TYPE = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
}


def new_run_id() -> str:
    return uuid.uuid4().hex[:8]


def store_image_bytes(data: bytes, media_type: str, run_id: str) -> dict:
    digest = hashlib.sha1(data).hexdigest()[:12]
    ext = EXT_BY_MEDIA_TYPE.get((media_type or '').lower(), 'png')
    filename = f'ankibrain-{digest}.{ext}'
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
    }


def image_dimensions(data: bytes):
    """
    (width, height) parsed from PNG IHDR / JPEG start-of-frame headers.
    Returns (0, 0) for unknown encodings ('could not determine', passes filters).
    """
    if (len(data) >= 24 and data[:8] == b'\x89PNG\r\n\x1a\n'
            and data[12:16] == b'IHDR'):
        return int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')

    if len(data) >= 4 and data[0] == 0xFF and data[1] == 0xD8:
        offset = 2
        while offset + 9 < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            is_sof = 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC)
            if is_sof:
                return (int.from_bytes(data[offset + 7:offset + 9], 'big'),
                        int.from_bytes(data[offset + 5:offset + 7], 'big'))
            offset += 2 + int.from_bytes(data[offset + 2:offset + 4], 'big')

    return 0, 0


def keep_image(data: bytes) -> bool:
    if not data or len(data) > MAX_IMAGE_BYTES:
        return False
    width, height = image_dimensions(data)
    if width > 0 and height > 0 and (width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION):
        return False
    return True


def store_extracted_images(images: list, run_id: str) -> list:
    """
    images: [{'data': bytes, 'mediaType': str, 'anchorChunk': int}] in document
    order. Dedupes by content hash, caps count and total bytes, writes files.
    Returns the stored descriptors (dropping images that failed to write).
    """
    stored = []
    seen_hashes = set()
    total_bytes = 0

    for image in images:
        data = image.get('data')
        if not keep_image(data):
            continue

        digest = hashlib.sha1(data).hexdigest()
        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)

        if len(stored) >= MAX_IMAGES_PER_DOCUMENT:
            break
        total_bytes += len(data)
        if total_bytes > MAX_TOTAL_IMAGE_BYTES:
            break

        try:
            entry = store_image_bytes(data, image.get('mediaType', 'image/png'), run_id)
        except OSError as e:
            print(f'(document_images) Failed writing extracted image: {e}')
            continue

        stored.append({
            'id': entry['id'],
            'url': entry['url'],
            'mediaType': image.get('mediaType', 'image/png'),
            'anchorChunk': image.get('anchorChunk'),
        })

    return stored


def split_text_with_markers(text: str, splitter):
    """
    Split text containing {{AB_IMG:<id>}} markers using the given langchain
    splitter. Splitting on the markers first guarantees a marker can never be
    torn apart by the character splitter.

    Returns (chunk_texts, anchors) where anchors maps image id -> the index of
    the chunk that FOLLOWS the image (or the final chunk count when the image
    trails the document).
    """
    parts = MARKER_REGEX.split(text)  # [seg0, id0, seg1, id1, seg2, ...]
    chunk_texts = []
    anchors = {}

    for i in range(0, len(parts), 2):
        segment = (parts[i] or '').strip()
        if segment:
            chunk_texts.extend(splitter.split_text(segment))

        if i + 1 < len(parts):
            anchors[int(parts[i + 1])] = len(chunk_texts)

    return chunk_texts, anchors


def detect_media_type(data: bytes) -> str:
    """
    Determine the image type from magic bytes. Works across pypdf versions
    (older ones expose ImageFile.ext, newer ones do not).
    """
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    if data[:2] == b'BM':
        return 'image/bmp'
    return 'image/png'


def extract_pdf_images_and_pages(docpath: str):
    """
    Returns [(page_index_0based, data, mediaType)] in document order.
    Extraction problems on a page are logged and skipped, never fatal.
    """
    from pypdf import PdfReader

    reader = PdfReader(docpath)
    found = []
    for page_index, page in enumerate(reader.pages):
        try:
            page_images = list(page.images)
        except Exception as e:
            print(f'(document_images) PDF page {page_index} image extraction failed: {e}')
            continue

        page_count = 0
        for image in page_images:
            if page_count >= MAX_IMAGES_PER_PAGE:
                break
            try:
                data = image.data
            except Exception as e:
                print(f'(document_images) PDF image read failed on page {page_index}: {e}')
                continue
            if not data:
                continue

            found.append((page_index, data, detect_media_type(data)))
            page_count += 1

    return found


def extract_docx_text_and_images(docpath: str):
    """
    Walks top-level paragraphs in order, building text with {{AB_IMG:<id>}}
    markers placed after the paragraph each inline image appears in.
    Returns (text, images) with images = [{'data', 'mediaType'}] in order.
    """
    from docx import Document as DocxDocument
    from docx.oxml.ns import qn

    doc = DocxDocument(docpath)
    images = []
    segments = []

    for para in doc.paragraphs:
        markers = []
        try:
            blips = para._p.xpath('.//a:blip')
        except Exception:
            blips = []

        for blip in blips:
            rid = blip.get(qn('r:embed')) or blip.get(qn('r:link'))
            if not rid:
                continue
            part = doc.part.related_parts.get(rid)
            if part is None:
                continue
            blob = getattr(part, 'blob', None)
            if not blob:
                continue
            images.append({
                'data': blob,
                'mediaType': getattr(part, 'content_type', None) or 'image/png',
            })
            markers.append('{{AB_IMG:' + str(len(images) - 1) + '}}')

        segments.append(para.text + ''.join(markers))

    return '\n\n'.join(segments), images
