import os
import sys
from os import path
from typing import List, Any

module_dir = path.abspath(path.dirname(__file__))
ankibrain_project_root_dir = path.join(module_dir, '..')
user_data_dir = path.join(ankibrain_project_root_dir, 'user_files')
dotenv_path = path.join(user_data_dir, '.env')

import json
from dotenv import load_dotenv

from ChatAIWithDocuments import ChatAIWithDocuments
from ChatAIWithoutDocuments import ChatAIWithoutDocuments
from InterprocessCommand import InterprocessCommand as IC
from langchain.callbacks import get_openai_callback


def _module_return(data: dict[str, str]):
    print(json.dumps(data))
    sys.stdout.flush()


def module_return(cmd: IC, data: dict[str, Any] = None):
    if data is None:
        data = {}

    # Always attach total_cost to the module's response.
    if oa_cb is not None:
        data['total_cost'] = oa_cb.total_cost
    else:
        raise Exception('Must supply an OpenAICallbackHandler.')

    _module_return({
        'cmd': cmd.value,
        'data': data
    })


def module_error(text: str):
    _module_return({
        'cmd': IC.SUBMODULE_ERROR.value,
        'data': {'error': text}
    })


def handle_module_input(provider: str, data: dict[str, Any]):
    if os.getenv('OPENAI_API_KEY') is None and provider == "openai":
        module_error('Please set OPENAI_API_KEY')
        return

    cmd = data['cmd']
    cmd = IC[cmd]

    if cmd == IC.ASK_CONVERSATION_DOCUMENTS:
        response = withDocumentsAI.human_message(data['query'])
        module_return(IC.DID_ASK_CONVERSATION_DOCUMENTS, {
            'response': response[0],
            'source_documents': json.dumps(response[1])
        })

    elif cmd == IC.ASK_CONVERSATION_NO_DOCUMENTS:
        response = withoutDocumentsAI.human_message(data['query'])
        module_return(IC.DID_ASK_CONVERSATION_NO_DOCUMENTS, {
            'response': response[0]
        })

    elif cmd == IC.EXPLAIN_TOPIC:
        topic = data['topic']
        options = data['options']
        custom_prompt = options['custom_prompt']
        level_of_detail = options['level_of_detail']
        level_of_expertise = options['level_of_expertise']
        use_documents = options['use_documents']
        language = options['language']

        if use_documents:
            # Internally clears conversation. Have to clear on frontend as well.
            response = withDocumentsAI.explain_topic(
                topic,
                {
                    'custom_prompt': custom_prompt,
                    'level_of_detail': level_of_detail,
                    'level_of_expertise': level_of_expertise,
                    'language': language
                }
            )
        else:
            response = withoutDocumentsSingleQuery.explain_topic(
                topic,
                {
                    'custom_prompt': custom_prompt,
                    'level_of_detail': level_of_detail,
                    'level_of_expertise': level_of_expertise,
                    'language': language
                }
            )

        module_return(IC.DID_EXPLAIN_TOPIC, {'explanation': response})

    elif cmd == IC.GENERATE_CARDS:
        text = data['text']
        custom_prompt = data['custom_prompt']
        card_type = data['type']
        language = data['language']

        # Never need to use documents AI in order to simply make the json.
        try:
            cards_raw_string = withoutDocumentsSingleQuery.generate_cards(text,
                                                                          {'custom_prompt': custom_prompt, 'type': card_type, 'language': language})
            module_return(IC.DID_GENERATE_CARDS, {'cardsRawString': cards_raw_string})
        except Exception as e:
            module_error(str(e))

    elif cmd == IC.CLEAR_CONVERSATION:
        withDocumentsAI.clear_memory()
        withoutDocumentsAI.clear_memory()

        module_return(IC.DID_CLEAR_CONVERSATION)

    elif cmd == IC.ADD_DOCUMENTS:
        documents: dict = data['documents']
        docpaths: List[str] = []

        for doc in documents:
            docpaths.append(doc['path'])

        for docpath in docpaths:
            withDocumentsAI.add_document_from_path(docpath)

        module_return(IC.DID_ADD_DOCUMENTS, {
            'documents_added': documents
        })

    elif cmd == IC.DELETE_ALL_DOCUMENTS:
        withDocumentsAI.clear_documents()
        module_return(IC.DID_DELETE_ALL_DOCUMENTS)

    elif cmd == IC.SPLIT_DOCUMENT:
        document_chunks = withDocumentsAI.split_document(data['path'])
        chunks = [chunk.page_content for chunk in document_chunks]
        module_return(IC.DID_SPLIT_DOCUMENT, {'chunks': json.dumps(chunks)})


if __name__ == '__main__':
    provider = "openai"
    try:
        settings_path = path.join(user_data_dir, 'settings.json')
        with open(settings_path, 'r') as f:
            data = json.load(f)
            provider = data.get('llmProvider', provider)
            ollamaHost = data.get('ollamaHost', 'http://127.0.0.1:11434')
            model = data.get('llmModel', 'gpt-3.5-turbo')
            temperature = data.get('temperature', 0)

        # Create .env if it doesn't exist.
        if not os.path.isfile(dotenv_path):
            with open(dotenv_path, 'w') as f:
                pass

        load_dotenv(dotenv_path, override=True)

        if os.getenv('OPENAI_API_KEY') is not None or provider == "ollama":
            withDocumentsAI = ChatAIWithDocuments(provider=provider, model_name=model, temperature=temperature, base_url=ollamaHost)
            withoutDocumentsAI = ChatAIWithoutDocuments(provider=provider, model_name=model, temperature=temperature, base_url=ollamaHost)

            withoutDocumentsSingleQuery = ChatAIWithoutDocuments(provider=provider, model_name=model, temperature=temperature, base_url=ollamaHost)

        # Send ready message now after finished loading above.
        _module_return({'status': 'success'})
    except Exception as e:
        module_error(str(e))

    with get_openai_callback() as oa_cb:
        while True:
            input_line = sys.stdin.readline().strip()
            if not input_line:
                continue

            try:
                input_data = json.loads(input_line)
                if not input_data or type(input_data) != dict:
                    module_error(f'<ChatAI Module> Malformed module input: {str(input_data)}')
                    continue

                try:
                    handle_module_input(provider, input_data)
                except Exception as e:
                    module_error(str(e))
            except json.JSONDecodeError:
                module_error(f'Invalid JSON input: {input_line}')
            except Exception as e:
                module_error(str(e))
