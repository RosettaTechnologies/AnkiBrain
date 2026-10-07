"""Local (offline) embedding function for LOCAL-mode document RAG.

Chroma's bundled all-MiniLM-L6-v2 ONNX model (384 dims, cosine) instead of an
API embeddings endpoint: chat gateways such as opencode Zen/Go expose no
/embeddings route, so API embeddings made document import impossible there.
onnxruntime, tokenizers and tqdm already ship with chromadb, so this adds no
engine dependency and needs no API key. The model is fetched once (~80 MB) into
user_files/local_engine/models/onnx-minilm and is removed by engine uninstall
(delete_engine_root wipes the whole local_engine tree).
"""
from os import path
from pathlib import Path
from typing import List

from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
from langchain_core.embeddings import Embeddings

user_data_dir = path.join(path.abspath(path.dirname(__file__)), '..', 'user_files')
MODEL_DIR = Path(path.join(user_data_dir, 'local_engine', 'models', 'onnx-minilm'))


class LocalMiniLMEmbeddings(Embeddings):
    """all-MiniLM-L6-v2 (384 dims), embedded locally by chroma's bundled ONNX runtime.

    langchain's Chroma — the document RAG, and the only consumer — calls
    embed_documents/embed_query. Chroma's own ONNX embedding function is reused
    for the model, with its download path moved under the engine data tree so an
    engine uninstall removes the model with the rest of local_engine/.
    """

    def __init__(self, preferred_providers: List[str] = None):
        self._ef = ONNXMiniLM_L6_V2(preferred_providers=preferred_providers)
        self._ef.DOWNLOAD_PATH = MODEL_DIR

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._ef(list(texts))

    def embed_query(self, text: str) -> List[float]:
        return self._ef([text])[0]
