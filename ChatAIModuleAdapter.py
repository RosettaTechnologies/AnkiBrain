from os import path
from typing import List, TypedDict, Optional

from ExternalScriptManager import ExternalScriptManager
from project_paths import python_path, ChatAI_module_dir

ChatAI_module_init_path = path.join(ChatAI_module_dir, '__init__.py')

from InterprocessCommand import InterprocessCommand as IC
import json
from AnkiBrainDocument import AnkiBrainDocument
from enum import Enum


class ChatAIModuleAdapter:
    """
    This is a class that wraps ExternalScriptManager which calls the ChatAI module as an external
    python script. This is necessary because we want to execute the AI within a virtual environment
    for dependency needs.
    """

    def __init__(self):
        self.scriptManager = ExternalScriptManager(python_path=python_path, script_path=ChatAI_module_init_path)

    async def start(self):
        await self.scriptManager.start()

    async def stop(self):
        await self.scriptManager.stop()

    class CallResponse(TypedDict):
        cmd: str
        data: dict
        error: Optional[str]

    async def _call_dict(self, data: dict[str, str]) -> CallResponse:
        out = await self.scriptManager.call(data)
        return out

    async def call(self, cmd: IC, **kwargs) -> CallResponse:
        data = {'cmd': cmd.value}
        data.update(kwargs)
        print(f'<ChatAIModuleAdapter> Sending cmd to ChatAI module: {json.dumps(data)}')

        out = await self._call_dict(data)
        print(f'<ChatAIModuleAdapter> Received output from ChatAI module: {json.dumps(out)}')

        return out

    class AskWithDocumentsResponse(TypedDict):
        response: str
        source_documents: List[str]

    async def ask_conversation_with_documents(self, query: str) -> AskWithDocumentsResponse:
        output = await self.call(IC.ASK_CONVERSATION_DOCUMENTS, query=query)
        return output['data']

    class AskWithoutDocumentsResponse(TypedDict):
        response: str

    async def ask_conversation_no_documents(self, query: str) -> AskWithoutDocumentsResponse:
        output = await self.call(IC.ASK_CONVERSATION_NO_DOCUMENTS, query=query)
        return output['data']

    async def add_documents(self, documents: List[AnkiBrainDocument]):
        output = await self.call(IC.ADD_DOCUMENTS, documents=documents)
        return output['data']

    async def split_document(self, pth: str):
        output = await self.call(IC.SPLIT_DOCUMENT, path=pth)
        return output['data']

    async def explain_topic(self, topic, options):
        output = await self.call(
            IC.EXPLAIN_TOPIC,
            topic=topic,
            options=options
        )

        return output['data']

    class CardType(Enum):
        BASIC = 'basic'
        CLOZE = 'cloze'

    async def generate_cards(self, text: str, custom_prompt: str, card_type: CardType, language: str) -> dict:
        output = await self.call(IC.GENERATE_CARDS, text=text, custom_prompt=custom_prompt, type=card_type, language=language)
        return output['data']

    async def ask_dummy(self, query: str):
        import time
        time.sleep(5)
        return {'response': 'dummy response'}

    async def clear_conversation(self):
        output = await self.call(IC.CLEAR_CONVERSATION)
        return output['data']

    async def delete_all_documents(self):
        output = await self.call(IC.DELETE_ALL_DOCUMENTS)
        return output['data']

    async def set_openai_api_key(self, key):
        output = await self.call(IC.SET_OPENAI_API_KEY, key=key)
        return output['data']
