from typing import TypedDict


class AnkiBrainDocument(TypedDict):
    file_name_with_extension: str
    file_name: str
    extension: str
    path: str
    size: str
