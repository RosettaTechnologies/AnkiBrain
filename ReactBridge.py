import asyncio
import json
import os
from typing import List

from aqt import mw

from AnkiBrain import AnkiBrain
from AnkiBrainDocument import AnkiBrainDocument
from InterprocessCommand import InterprocessCommand as IC
from cards import add_basic_card, add_cloze_card
from networking import fetch, postDocument


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


class ReactBridge:
    """
    Bridge for communication to/from React JS app.
    """

    def __init__(self, app: AnkiBrain):
        self.app = app

        # Hook for receiving data from webview react main app.
        self.app.sidePanel.webview.page().react_data_received.connect(self.handle_react_data_received)

    def send_to_js(self, json_dict: dict):
        try:
            self.app.guiThreadSignaler.sendToJSFromAsyncThreadSignal.emit(json_dict)
        except Exception as e:
            print(str(e))

    def send_cmd(self, cmd: IC, data=None, commandId=None, error=None):
        if data is None:
            data = {}

        consolidated = {'cmd': cmd.value, 'data': data, 'commandId': commandId}
        if error is not None:
            # Only include error field if there was an error.
            consolidated['error'] = error

        print(f'(ReactBridge) Sending cmd to react app: {json.dumps(consolidated)}')
        self.send_to_js(consolidated)

    def set_webapp_loading(self, value: bool):
        self.send_cmd(IC.SET_WEBAPP_LOADING, {'value': value})

    def handle_react_data_received(self, data: str):
        from aqt import mw
        loop = mw.ankiBrain.loop
        asyncio.run_coroutine_threadsafe(self.a_handle_react_data_received(json.loads(data)), loop)

    def trigger(self, cmd: IC, **kwargs):
        """
        Trigger an incoming event on the ReactBridge (can be used from python side for redirecting).
        :param cmd:
        :param kwargs:
        :return:
        """
        data = {'cmd': cmd.value}
        data.update(kwargs)
        print(f'<ReactBridge> Self-triggering for cmd: {json.dumps(data)}')

        self.handle_react_data_received(json.dumps(data))

    async def a_handle_react_data_received(self, data: dict):
        try:
            print(f'<ReactBridge> Received cmd {json.dumps(data)}')
            cmd = data['cmd']
            commandId = data['commandId'] if 'commandId' in data else ''

            # Convert cmd to InterprocessCommand enum for easier comparisons.
            cmd = IC[cmd]

            if cmd == IC.EXPLAIN_TOPIC:
                topic = data['topic']
                options = data['options']

                output = await self.app.chatAI.explain_topic(topic, options)
                self.send_cmd(
                    IC.DID_EXPLAIN_TOPIC,
                    output,
                    commandId
                )

            elif cmd == IC.GENERATE_CARDS:
                text = data['text']
                custom_prompt = data['customPrompt']
                card_type = data['type']
                language = data['language']
                try:
                    output = await self.app.chatAI.generate_cards(text=text, custom_prompt=custom_prompt, card_type=card_type, language=language)
                    self.send_cmd(
                        IC.DID_GENERATE_CARDS,
                        output,
                        commandId
                    )
                except Exception as e:
                    # self.send_cmd(IC.FAILED_GENERATE_CARDS, {'error': json.loads(str(e))})
                    self.send_cmd(IC.DID_GENERATE_CARDS, error=str(e), commandId=commandId)

            elif cmd == IC.ADD_CARDS:
                try:
                    deck_name = data['deckName']
                    for card in data['cards']:
                        card_type = card['type']
                        tags = card['tags']
                        if card_type == 'basic':
                            front = card['front']
                            back = card['back']
                            add_basic_card(front, back, deck_name=deck_name, tags=tags)
                        elif card_type == 'cloze':
                            text = card['text']
                            add_cloze_card(text, deck_name=deck_name, tags=tags)
                    self.send_cmd(IC.DID_ADD_CARDS, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_ADD_CARDS, error=str(e), commandId=commandId)

            elif cmd == IC.ASK_CONVERSATION_DOCUMENTS:
                output = await self.app.chatAI.ask_conversation_with_documents(data['query'])
                self.send_cmd(
                    IC.DID_ASK_CONVERSATION_DOCUMENTS,
                    output,
                    commandId
                )

            elif cmd == IC.ASK_CONVERSATION_NO_DOCUMENTS:
                output = await self.app.chatAI.ask_conversation_no_documents(data['query'])
                self.send_cmd(
                    IC.DID_ASK_CONVERSATION_NO_DOCUMENTS,
                    output,
                    commandId
                )

            elif cmd == IC.CLEAR_CONVERSATION:
                await self.app.chatAI.clear_conversation()
                print('<ReactBridge> cleared conversation, now sending confirmation to react')
                self.send_cmd(IC.DID_CLEAR_CONVERSATION, commandId=commandId)

            elif cmd == IC.ADD_DOCUMENTS:
                try:
                    documents: List[AnkiBrainDocument] = data['documents']

                    output = await self.app.chatAI.add_documents(documents)
                    documents_added = output['documents_added']

                    # Keep track of the documents that have been saved.
                    mw.settingsManager.add_saved_documents(documents_added)
                    self.send_cmd(IC.DID_ADD_DOCUMENTS, output, commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_ADD_DOCUMENTS, error=str(e), commandId=commandId)

            elif cmd == IC.DELETE_ALL_DOCUMENTS:
                await self.app.chatAI.delete_all_documents()
                self.send_cmd(IC.DID_DELETE_ALL_DOCUMENTS, commandId=commandId)

            elif cmd == IC.OPEN_DOCUMENT_BROWSER:
                mw.ankiBrain.guiThreadSignaler.openFileBrowserSignal.emit(commandId)

            elif cmd == IC.DID_CLOSE_DOCUMENT_BROWSER_NO_SELECTIONS:
                self.send_cmd(IC.DID_CLOSE_DOCUMENT_BROWSER_NO_SELECTIONS, commandId=commandId)

            elif cmd == IC.UPLOAD_DOCUMENT:
                try:
                    path = data['path']
                    url = data['url']
                    accessToken = data['accessToken']
                    res = await postDocument(path, url, accessToken)
                    self.send_cmd(IC.DID_UPLOAD_DOCUMENT, data=res, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_UPLOAD_DOCUMENT, error=str(e), commandId=commandId)

            elif cmd == IC.SPLIT_DOCUMENT:
                try:
                    path = data['path']
                    res = await self.app.chatAI.split_document(path)
                    self.send_cmd(IC.DID_SPLIT_DOCUMENT, data=res, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_SPLIT_DOCUMENT, error=str(e), commandId=commandId)

            elif cmd == IC.NETWORK_REQUEST:
                url = data['url']
                verb = data['verb']
                data = data['data']

                try:
                    res = await fetch(url, verb, data)  # todo try/except, send err to js
                    self.send_cmd(IC.DID_NETWORK_REQUEST, data=res, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_NETWORK_REQUEST, error=str(e), commandId=commandId)

            elif cmd == IC.SET_OPENAI_API_KEY:
                key = data['key']

                await self.app.chatAI.set_openai_api_key(key)
                os.environ['OPENAI_API_KEY'] = key
                self.send_cmd(IC.DID_SET_OPENAI_API_KEY, commandId=commandId)

            elif cmd == IC.EDIT_SETTING:
                key = data['key']
                value = data['value']
                if type(value) == 'dict':
                    value = json.dumps(value)

                mw.settingsManager.edit(key, value)
                self.send_cmd(IC.DID_EDIT_SETTING, commandId=commandId)

            elif cmd == IC.PRINT_FROM_JS:
                print(data['text'])
        except Exception as e:
            self.send_cmd(IC.ERROR, {
                'message':
                    f'''
                    AnkiBrain AI Engine encountered an error. 
                    Details of the error:\n\n{str(e)}
                    
                    If you still need help, go to https://www.reddit.com/r/ankibrain/.
                    '''
            })
