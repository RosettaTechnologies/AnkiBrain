import json
import os
from os import path
from typing import Tuple, List

from langchain.chains import ConversationalRetrievalChain
from langchain.chat_models import ChatOpenAI
from langchain_community.chat_models import ChatOllama
from langchain.document_loaders import TextLoader, PyPDFLoader, Docx2txtLoader, UnstructuredPowerPointLoader, \
    UnstructuredHTMLLoader
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.memory import ConversationBufferMemory
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import Chroma

from ChatInterface import ChatInterface


def get_file_extension(file_name: str) -> str:
    return path.splitext(file_name)[1]


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
    def __init__(self, provider, model_name, temperature, base_url, documents_dir_path: str = default_documents_dir, persist_directory=persist_dir):
        if not path.isdir(persist_dir):
            os.mkdir(persist_dir)

        self.documents_dir_path = documents_dir_path

        self.text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100, length_function=len)

        if provider == 'ollama':
            self.llm = ChatOllama(temperature=temperature, model_name=model_name, base_url=base_url)
        else:
            self.llm = ChatOpenAI(temperature=temperature, model_name=model_name)
        
        self.vectorstore = Chroma(embedding_function=HuggingFaceEmbeddings(), persist_directory=persist_directory)
        self.memory = ConversationBufferMemory(memory_key="chat_history", output_key='answer',
                                               return_messages=True)

        self.qa = ConversationalRetrievalChain.from_llm(
            self.llm,
            self.vectorstore.as_retriever(),
            memory=self.memory,
            return_source_documents=True
        )

        if not path.isfile(settings_path):
            with open(settings_path, 'w') as f:
                json.dump({}, f)

        with open(settings_path, 'r+') as f:
            settings = json.load(f)
            if 'documents_saved' not in settings:
                settings['documents_saved'] = []
                rewrite_json_file(settings, f)

        # self.scan_documents_folder()

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
        self.vectorstore.add_documents(documents)
        self.vectorstore.persist()

    def split_document(self, docpath: str):
        # Set up the loader based on file type.
        ext = get_file_extension(docpath)
        loader = None
        documents: List[Document] = []
        if ext == '.txt':
            loader = TextLoader(docpath, encoding='utf-8')
            documents = loader.load()
            documents = self.text_splitter.split_documents(documents)
        elif ext == '.pdf':
            loader = PyPDFLoader(docpath)
            documents = loader.load()
            documents = self.text_splitter.split_documents(documents)
        elif ext == '.docx':
            loader = Docx2txtLoader(docpath)
            documents = loader.load()
            documents = self.text_splitter.split_documents(documents)
        elif ext == '.pptx':
            loader = UnstructuredPowerPointLoader(docpath)
            documents = loader.load()
            documents = self.text_splitter.split_documents(documents)
        elif ext == '.html':
            loader = UnstructuredHTMLLoader(docpath)
            documents = loader.load()
            documents = self.text_splitter.split_documents(documents)
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

    def clear_documents(self):
        self.vectorstore.delete_collection()
        self.vectorstore.persist()

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
