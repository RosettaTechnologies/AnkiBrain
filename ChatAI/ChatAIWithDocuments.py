"""
RAG-enabled ChatAI (document Q&A) for LOCAL mode.

LOCAL mode embeds with the engine's local ONNX MiniLM model
(`local_embeddings.LocalMiniLMEmbeddings`, 384 dims) into the
`ankibrain-minilm` Chroma collection. Documents indexed by any earlier build
(768-dim mpnet, then 1536-dim OpenAI text-embedding-3-small) are unreachable —
re-import the files to re-index them; the legacy collections are deleted on the
next engine start.
"""

import json
import os
import sys
from os import path
from typing import Optional, Tuple, List

import chromadb
from langchain_classic.chains import ConversationalRetrievalChain
from langchain_classic.memory import ConversationBufferMemory
from langchain_community.document_loaders import BSHTMLLoader
from langchain_community.document_loaders import Docx2txtLoader
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.document_loaders import TextLoader
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter

from ChatInterface import ChatInterface
from llm_config import get_openai_base_url, get_openai_headers
from local_embeddings import LocalMiniLMEmbeddings
from document_images import (
    extract_pdf_images_and_pages,
    extract_docx_text_and_images,
    split_text_with_markers,
    store_extracted_images,
    new_run_id,
)
from pptx_loader import load_pptx_text


def get_file_extension(file_name: str) -> str:
    return path.splitext(file_name)[1]


def get_card_gen_chunk_size(model_name: str) -> int:
    if model_name and model_name.startswith('gpt-5.6'):
        return 6000

    return 3000


def rewrite_json_file(new_data: dict, f):
    """
    Helper function to rewrite json root object to .json file.
    :param new_data:
    :param f:
    :return:
    """
    f.seek(0)
    json.dump(new_data, f)
    f.truncate()


user_data_dir = path.join(
    path.abspath(path.dirname(__file__)),
    '..',
    'user_files'
)

default_documents_dir = path.join(user_data_dir, 'documents')
db_dir = path.join(user_data_dir, 'db')
if not path.isdir(db_dir):
    os.mkdir(db_dir)

documents_json_path = path.join(user_data_dir, 'documents.json')  # Not inside the documents dir.

persist_dir = path.join(db_dir, 'chroma-persist')
settings_path = path.join(user_data_dir, 'settings.json')


class ChatAIWithDocuments(ChatInterface):
    def __init__(self, documents_dir_path: str = default_documents_dir, persist_directory=persist_dir):
        if not path.isdir(persist_dir):
            os.mkdir(persist_dir)

        self.documents_dir_path = documents_dir_path
        self.persist_directory = persist_directory

        self.text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100, length_function=len)

        temperature = 0
        model_name = 'gpt-5.6-luna'
        with open(settings_path, 'r') as f:
            data = json.load(f)
            temperature = data['temperature']
            model_name = data['llmModel']

        # A stalled request blocks the engine's single stdin/stdout pipe, so
        # every client gets an explicit bounded timeout instead of the SDK's
        # 600 s default.
        self.llm = ChatOpenAI(temperature=temperature, model_name=model_name,
                              base_url=get_openai_base_url(), default_headers=get_openai_headers(),
                              timeout=120, max_retries=1)
        self.memory = ConversationBufferMemory(memory_key="chat_history", output_key='answer',
                                               return_messages=True)
        self._init_vectorstore()

        if not path.isfile(settings_path):
            with open(settings_path, 'w') as f:
                json.dump({}, f)

        with open(settings_path, 'r+') as f:
            settings = json.load(f)
            if 'documents_saved' not in settings:
                settings['documents_saved'] = []
                rewrite_json_file(settings, f)

        # self.scan_documents_folder()

    def _init_vectorstore(self):
        """
        (Re)build the local vector store and the retrieval chain over it.

        Also used by clear_documents: chromadb's delete_collection() leaves the
        store's Collection handle pointing at the deleted collection, so without
        replacing these objects a later add/query raises 'Collection does not
        exist' until the engine restarts.
        """
        client = chromadb.PersistentClient(path=self.persist_directory)
        # Collections from earlier builds embed with a different function (768-dim
        # mpnet, then 1536-dim OpenAI), so they can never be queried again and are
        # dropped instead of left to grow on disk.
        for legacy in ('ankibrain', 'langchain'):
            try:
                if any(c.name == legacy for c in client.list_collections()):
                    client.delete_collection(legacy)
                    print(f'<ChatAI> deleted legacy document collection {legacy}', file=sys.stderr)
            except Exception as e:
                print(f'<ChatAI> could not delete legacy collection {legacy}: {e}', file=sys.stderr)
        # 'ankibrain-minilm' is fixed to LocalMiniLMEmbeddings' 384 dims; a
        # differently-sized collection under this name would make add_documents
        # fail with a dimension mismatch, so it is never reused for another model.
        self.vectorstore = Chroma(
            collection_name='ankibrain-minilm',
            embedding_function=LocalMiniLMEmbeddings(),
            client=client,
        )
        self.qa = ConversationalRetrievalChain.from_llm(
            self.llm,
            self.vectorstore.as_retriever(),
            memory=self.memory,
            return_source_documents=True
        )

    def clear_memory(self):
        self.memory.clear()

    def scan_documents_folder(self):
        """
        Looks through user documents to find any new docs. Will then add these
        new docs to the vectorstore. We apparently cannot delete specific documents from the vectorstore
        as an unfortunate limitation of the underlying Chroma database.
        :return:
        """

        with open(settings_path, 'r+') as f:
            """
            Save all file paths found in user_files/documents.
            
            For all the files that have been found:
            if the file name and path is not already saved in documents.json, save it to documents.json.
            Also, will persist it to vectorstore. 
            """
            data = json.load(f)
            for dirName, subdirList, fileNames in os.walk(self.documents_dir_path):
                for fileName in fileNames:
                    full_path = path.join(dirName, fileName)
                    if full_path not in data['documents_saved']:
                        data['documents_saved'].append(full_path)
                        self.add_document_from_path(full_path)

            # Write changes to file using helper fn.
            rewrite_json_file(data, f)

    def add_document(self, document: Document):
        self.add_documents([document])

    def add_documents(self, documents: List[Document]):
        # chromadb >= 0.4 persists on write; langchain's Chroma.persist() would
        # raise on a client we constructed ourselves.
        self.vectorstore.add_documents(documents)

    def split_document(self, docpath: str, chunk_size: Optional[int] = None):
        # Set up the loader based on file type.
        ext = get_file_extension(docpath)
        loader = None
        documents: List[Document] = []
        text_splitter = self.text_splitter
        if chunk_size is not None:
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=0,
                                                           length_function=len)

        if ext == '.txt':
            loader = TextLoader(docpath, encoding='utf-8')
            documents = loader.load()
            documents = text_splitter.split_documents(documents)
        elif ext == '.pdf':
            loader = PyPDFLoader(docpath)
            documents = loader.load()
            documents = text_splitter.split_documents(documents)
        elif ext == '.docx':
            loader = Docx2txtLoader(docpath)
            documents = loader.load()
            documents = text_splitter.split_documents(documents)
        elif ext == '.pptx':
            # python-pptx instead of unstructured's pptx partition: keeps
            # spaCy/numba/nltk out of the engine venv entirely.
            documents = text_splitter.split_documents([
                Document(page_content=load_pptx_text(docpath), metadata={'source': docpath})
            ])
        elif ext == '.html':
            loader = BSHTMLLoader(docpath)
            documents = loader.load()
            documents = text_splitter.split_documents(documents)
        else:
            raise Exception(
                'Document type not supported at this time.\n'
                'Please import a document with a supported extension.\n'
            )

        return documents

    def add_document_from_path(self, docpath: str):
        """
        Takes in a path to a file, applies the splitter to create document(s), then
        adds the document(s) to the vectorstore.
        :param docpath:
        :return:
        """

        docs = self.split_document(docpath)
        self.add_documents(docs)

    def split_document_for_cards(self, docpath: str, chunk_size: int):
        """
        Card-generation split: like split_document but also extracts document
        images (PDF embedded images, DOCX inline images) and reports each
        image's anchor chunk so the webview can attach images to cards
        positionally. Returns (chunk_texts, chunk_pages, images) where
        chunk_pages holds each chunk's 1-based source page number (None when
        the format has no pages) and images items are
        {'id', 'url', 'mediaType', 'anchorChunk'} files already written to
        user_files/media_tmp.
        """
        ext = get_file_extension(docpath).lower()
        splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=0,
                                                  length_function=len)

        if ext == '.pdf':
            loader = PyPDFLoader(docpath)
            documents = splitter.split_documents(loader.load())
            chunk_texts = [doc.page_content for doc in documents]
            # PyPDFLoader stores the 0-based page under metadata['page']; emit
            # 1-based so both modes (server sends loc.pageNumber) agree.
            chunk_pages = [
                doc.metadata.get('page') + 1
                if doc.metadata.get('page') is not None else None
                for doc in documents
            ]

            def anchor_for_page(page_index):
                for i, doc in enumerate(documents):
                    doc_page = doc.metadata.get('page')
                    if doc_page is not None and doc_page >= page_index:
                        return i
                return len(chunk_texts)

            raw_images = [
                {
                    'data': data,
                    'mediaType': media_type,
                    'anchorChunk': anchor_for_page(page_index),
                }
                for (page_index, data, media_type) in extract_pdf_images_and_pages(docpath)
            ]
        elif ext == '.docx':
            text, raw_images = extract_docx_text_and_images(docpath)
            chunk_texts, anchors = split_text_with_markers(text, splitter)
            chunk_pages = [None] * len(chunk_texts)
            for i, image in enumerate(raw_images):
                image['anchorChunk'] = anchors.get(i, len(chunk_texts))
        else:
            # txt/pptx/html and anything else: same behavior as before, no images.
            documents = self.split_document(docpath, chunk_size=chunk_size)
            chunk_texts = [doc.page_content for doc in documents]
            chunk_pages = [None] * len(chunk_texts)
            raw_images = []

        images = store_extracted_images(raw_images, new_run_id())
        return chunk_texts, chunk_pages, images

    def clear_documents(self):
        try:
            self.vectorstore.delete_collection()
        except Exception as e:
            print(f'<ChatAI> could not delete document collection: {e}', file=sys.stderr)
        self._init_vectorstore()

    def human_message(self, query: str) -> Tuple[str, list[dict[str, str]]]:
        result = self.qa({'question': query})
        answer = result['answer']
        source_documents: List[Document] = result['source_documents']
        source_documents_output: List[dict[str, str]] = []

        for doc in source_documents:
            source_documents_output.append({
                'page_content': doc.page_content,
                'source': doc.metadata['source']
            })

        return answer, source_documents_output
