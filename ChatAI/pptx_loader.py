"""
PowerPoint text extraction for the LOCAL-mode document importer.

Replaces `unstructured`'s pptx partition (dropped so spaCy/numba/nltk stay out
of the engine venv) with python-pptx: slide text frames and table cells are
extracted, one block per shape, in slide order. Slide notes are deliberately
not extracted — they are speaker notes, not document content.

An unreadable/corrupt file propagates: the subprocess bridge already turns any
exception into a SUBMODULE_ERROR the UI can show.
"""

from pptx import Presentation


def load_pptx_text(docpath: str) -> str:
    """All slide text frames + table cells of `docpath`, joined by blank lines."""
    blocks = []
    for slide in Presentation(docpath).slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                text = shape.text_frame.text.strip()
                if text:
                    blocks.append(text)
            elif shape.has_table:
                for row in shape.table.rows:
                    cells = [cell.text.strip() for cell in row.cells]
                    if any(cells):
                        blocks.append(' | '.join(cells))
    return '\n\n'.join(blocks)
