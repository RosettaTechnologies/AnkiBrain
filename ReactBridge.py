import asyncio
import json
import os
from typing import List

from aqt import mw

from AnkiBrainModule import AnkiBrain
from AnkiBrainDocument import AnkiBrainDocument
from InterprocessCommand import InterprocessCommand as IC
from KokoroTTSAdapter import TTSNotInstalledError, TTSUnsupportedError
from cards import add_basic_card, add_cloze_card
from media_images import store_server_split_images, resolve_card_image_paths, resolve_image_entry
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
                    cards = data['cards']

                    # AnkiBrain Voice: synthesize card audio up front so the
                    # [sound:] tags ride in with the fields. Degrades to
                    # "cards without audio" (never a blocked add) and tells
                    # JS why, so it can offer the engine install once.
                    settings = mw.settingsManager.settings
                    embed = bool(settings.get('ttsEnabled', True)) and bool(settings.get('ttsEmbedCardAudio', True))
                    sides = settings.get('ttsCardAudioSides') or 'answer'
                    tts_note = None
                    audio_back = {}
                    audio_front = {}
                    if embed:
                        avail, _reason = self.app.tts.availability()
                        if avail in ('unsupported', 'absent'):
                            embed = False
                            tts_note = avail
                        else:
                            for i, card in enumerate(cards):
                                try:
                                    if card.get('type') == 'cloze':
                                        d = await self.app.tts.speak_clean(card.get('text', ''), is_cloze=True)
                                        if d:
                                            audio_back[i] = [d['path']]
                                    else:
                                        if sides in ('answer', 'both'):
                                            d = await self.app.tts.speak_clean(card.get('back', ''))
                                            if d:
                                                audio_back.setdefault(i, []).append(d['path'])
                                        if sides in ('question', 'both'):
                                            d = await self.app.tts.speak_clean(card.get('front', ''))
                                            if d:
                                                audio_front.setdefault(i, []).append(d['path'])
                                except Exception as e:
                                    print(f'(ReactBridge) card audio synth failed, adding card without it: {e}')
                                    tts_note = 'error'

                    for i, card in enumerate(cards):
                        card_type = card['type']
                        tags = card['tags']
                        # Cards carry 'images' as media_tmp ids; resolve to
                        # on-disk paths here so full bytes never cross the
                        # JS<->Python bridge. Missing ids are skipped with a
                        # warning (e.g. purged by the startup cleanup).
                        image_paths = resolve_card_image_paths(card)
                        if card_type == 'basic':
                            front = card['front']
                            back = card['back']
                            add_basic_card(front, back, deck_name=deck_name, tags=tags,
                                           image_paths=image_paths,
                                           front_audio_paths=audio_front.get(i),
                                           back_audio_paths=audio_back.get(i))
                        elif card_type == 'cloze':
                            text = card['text']
                            add_cloze_card(text, deck_name=deck_name, tags=tags,
                                           image_paths=image_paths,
                                           audio_paths=audio_back.get(i))
                    payload = {} if tts_note is None else {'tts_note': tts_note}
                    self.send_cmd(IC.DID_ADD_CARDS, payload or None, commandId=commandId)
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

                    # A /document/split response can carry extracted document
                    # images as base64. Write them to media_tmp now and hand
                    # the webview id/url references only.
                    if isinstance(res, dict) and isinstance(res.get('data'), dict) \
                            and res['data'].get('images'):
                        res['data']['images'] = store_server_split_images(res['data']['images'])

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

            elif cmd == IC.RESOLVE_IMAGES:
                try:
                    # Re-hydrate the webview's images registry for ids
                    # referenced by cards restored from tempCards. Ids whose
                    # files were purged from media_tmp are dropped; the card
                    # still adds to Anki with whatever images remain.
                    images = []
                    for image_id in (data.get('ids') or []):
                        entry = resolve_image_entry(image_id)
                        if entry is not None:
                            images.append(entry)
                    self.send_cmd(IC.DID_RESOLVE_IMAGES, {'images': images}, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_RESOLVE_IMAGES, error=str(e), commandId=commandId)

            # ── AnkiBrain Voice (Kokoro TTS) ─────────────────────────────────
            elif cmd == IC.SYNTHESIZE_SPEECH:
                try:
                    voice = data.get('voice') or await self.app.tts.default_voice()
                    speed = data.get('speed') or await self.app.tts.default_speed()
                    if not self.app.tts.voice_allowed(voice):
                        # ja pipeline needs its pack; tell JS precisely.
                        self.send_cmd(IC.DID_SYNTHESIZE_SPEECH, error='TTS_PACK_MISSING:' + voice,
                                      commandId=commandId)
                    else:
                        out = await self.app.tts.speak_clean(data.get('text', ''), voice=voice, speed=speed)
                        if out is None:
                            self.send_cmd(IC.DID_SYNTHESIZE_SPEECH, {'url': None}, commandId=commandId)
                        else:
                            self.send_cmd(IC.DID_SYNTHESIZE_SPEECH, out, commandId=commandId)
                except TTSNotInstalledError:
                    # Stable sentinel the webview maps to the setup modal.
                    self.send_cmd(IC.DID_SYNTHESIZE_SPEECH, error='TTS_NOT_INSTALLED',
                                  commandId=commandId)
                except TTSUnsupportedError as e:
                    self.send_cmd(IC.DID_SYNTHESIZE_SPEECH, error=f'TTS_UNSUPPORTED:{e}',
                                  commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_SYNTHESIZE_SPEECH, error=str(e), commandId=commandId)

            elif cmd == IC.TTS_STATUS:
                try:
                    self.send_cmd(IC.DID_TTS_STATUS, self.app.tts.status(), commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_TTS_STATUS, error=str(e), commandId=commandId)

            elif cmd == IC.TTS_INSTALL:
                # Fire-and-forget: the ack just says "started"; the real story
                # arrives as pushed TTS_INSTALL_PROGRESS + TTS_INSTALL_DONE
                # events (an install outlives any single request promise).
                groups = tuple(data.get('groups') or ['core'])

                def _progress(ev):
                    self.send_cmd(IC.TTS_INSTALL_PROGRESS, ev)

                def _done(res):
                    self.send_cmd(IC.TTS_INSTALL_DONE, res)

                started = self.app.tts.start_install(groups=groups, on_event=_progress, on_done=_done)
                self.send_cmd(IC.DID_TTS_INSTALL, {'started': bool(started)}, commandId=commandId)

            elif cmd == IC.TTS_CANCEL_INSTALL:
                self.app.tts.cancel_install()
                self.send_cmd(IC.DID_TTS_INSTALL, {'cancelled': True}, commandId=commandId)

            elif cmd == IC.ADD_TTS_AUDIO:
                # Python-side flow (Speak button on a card selection): synth
                # here, then hand the playable file:// url to the webview.
                await self.speak_text(data.get('text', ''))

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

    async def speak_text(self, text: str):
        """
        Python-initiated speech (the card selection 'Speak' button). The
        webview is the only thing with an audio device here: we synthesize,
        then push a plain playTtsAudio command with the file:// url — same
        pattern as talkSelectedText/explainSelectedText, no promise needed.
        """
        if not text:
            return
        try:
            voice = await self.app.tts.default_voice()
            speed = await self.app.tts.default_speed()
            out = await self.app.tts.speak_clean(text, voice=voice, speed=speed)
            if out and out.get('url'):
                self.send_to_js({'cmd': 'playTtsAudio', 'url': out['url'], 'text': text[:80]})
        except (TTSNotInstalledError, TTSUnsupportedError):
            self.send_to_js({'cmd': 'ttsSetupRequired', 'pendingText': text})
        except Exception as e:
            print(f'(ReactBridge) speak_text failed: {e}')
            self.send_to_js({'cmd': 'ttsError', 'message': str(e)})
