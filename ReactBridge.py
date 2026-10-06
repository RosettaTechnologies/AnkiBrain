import asyncio
import json
import os
from typing import List

from aqt import mw

from AnkiBrainModule import AnkiBrain
from AnkiBrainDocument import AnkiBrainDocument
from InterprocessCommand import InterprocessCommand as IC
from KokoroTTSAdapter import TTSNotInstalledError, TTSUnsupportedError
from cards import add_basic_card, add_cloze_card, add_image_occlusion_card
from card_backup import clear_pending_backup, write_pending_backup
from media_images import (
    MEDIA_TMP_DIR,
    import_image_file,
    resolve_audio_entry,
    resolve_card_audio,
    resolve_card_image_paths,
    resolve_image_entry,
    resolve_image_path,
    store_server_split_images,
)
from networking import fetch, postDocument, postOcclusionImage
from util import UserMode


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

        # Card-audio queue state (GENERATE_CARD_AUDIO / CANCEL_CARD_AUDIO).
        # The lock serializes synthesis batches; the cancel flags are plain
        # mutations read between queue items. All of it lives on the asyncio
        # loop, never touched from worker threads.
        self._card_audio_lock = None
        self._card_audio_cancel_keys = set()
        self._card_audio_cancel_all = False

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

                    # AnkiBrain Voice: audio is NO LONGER synthesized here.
                    # The review screen enqueues GENERATE_CARD_AUDIO jobs and
                    # cards carry media_tmp audio ids by the time they arrive,
                    # so adding is pure file embedding — no engine calls, no
                    # multi-minute wait. Missing ids are skipped (same policy
                    # as images), never a blocked add.
                    for idx, card in enumerate(cards):
                        card_type = card['type']
                        tags = card['tags']
                        # Cards carry 'images' as media_tmp ids; resolve to
                        # on-disk paths here so full bytes never cross the
                        # JS<->Python bridge. Missing ids are skipped with a
                        # warning (e.g. purged by the startup cleanup).
                        image_paths = resolve_card_image_paths(card)
                        audio_paths = resolve_card_audio(card)
                        if card_type == 'basic':
                            front = card['front']
                            back = card['back']
                            add_basic_card(front, back, deck_name=deck_name, tags=tags,
                                           image_paths=image_paths,
                                           front_audio_paths=audio_paths['front'] or None,
                                           back_audio_paths=audio_paths['back'] or None)
                        elif card_type == 'cloze':
                            text = card['text']
                            add_cloze_card(text, deck_name=deck_name, tags=tags,
                                           image_paths=image_paths,
                                           audio_paths=audio_paths['back'] or None)
                        elif card_type == 'occlusion':
                            # One native IO note per image; shapes sharing an
                            # ordinal become one card. The image is required,
                            # so a missing file raises instead of silently
                            # adding a broken note.
                            occlusion_image_path = resolve_image_path(card.get('image') or '')
                            if occlusion_image_path is None:
                                raise Exception(
                                    'The image for an occlusion card is no longer available. '
                                    'Re-import it and try again.')
                            add_image_occlusion_card(
                                occlusion_image_path,
                                card.get('occlusions') or [],
                                header=card.get('header', ''),
                                back_extra=card.get('backExtra', ''),
                                tags=tags,
                                deck_name=deck_name,
                                occlude_inactive=bool(card.get('occludeInactive')),
                            )
                        # Yield so UI signals and card-audio work still run
                        # while a large batch is being inserted.
                        if idx % 25 == 24:
                            await asyncio.sleep(0)
                    # One UI refresh per add command instead of one per card
                    # (a full mw.reset() per note is what made bulk adds crawl).
                    mw.ankiBrain.guiThreadSignaler.resetUISignal.emit()
                    self.send_cmd(IC.DID_ADD_CARDS, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_ADD_CARDS, error=str(e), commandId=commandId)

            elif cmd == IC.BACKUP_CARDS:
                try:
                    write_pending_backup(data.get('cards') or [],
                                         data.get('deckName') or 'AnkiBrain')
                    self.send_cmd(IC.DID_BACKUP_CARDS, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_BACKUP_CARDS, error=str(e), commandId=commandId)

            elif cmd == IC.CLEAR_CARDS_BACKUP:
                try:
                    clear_pending_backup()
                    self.send_cmd(IC.DID_CLEAR_CARDS_BACKUP, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_CLEAR_CARDS_BACKUP, error=str(e), commandId=commandId)

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
                # allowImages: the Make Cards picker accepts documents and
                # image files; the Import screen's document browser does not.
                allow_images = bool(data.get('allowImages'))
                mw.ankiBrain.guiThreadSignaler.openFileBrowserSignal.emit(commandId, allow_images)

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

            elif cmd == IC.RESOLVE_AUDIO_IDS:
                try:
                    # Same re-hydration for card-audio tts ids (play/remove
                    # previews for cards restored from tempCards). Ids whose
                    # files were purged are dropped; the webview prunes those
                    # fields so the card simply reads as "no audio" again.
                    entries = []
                    for audio_id in (data.get('ids') or []):
                        entry = resolve_audio_entry(audio_id)
                        if entry is not None:
                            entries.append(entry)
                    self.send_cmd(IC.DID_RESOLVE_AUDIO_IDS, {'entries': entries}, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_RESOLVE_AUDIO_IDS, error=str(e), commandId=commandId)

            # ── Image occlusion (built-in Anki Image Occlusion notetype) ──
            elif cmd == IC.IMPORT_IMAGES:
                # The file/clipboard pickers must run on the UI thread; the
                # signal handlers answer DID_IMPORT_IMAGES with this commandId.
                source = data.get('source') or 'files'
                if source == 'paths':
                    # Make Cards flow: the webview already holds absolute
                    # paths from the combined document/image browser, so
                    # import them directly (no second picker).
                    images = []
                    for file_path in (data.get('paths') or []):
                        entry = import_image_file(file_path)
                        if entry is not None:
                            images.append(entry)
                    self.send_cmd(IC.DID_IMPORT_IMAGES, {'images': images},
                                  commandId=commandId)
                elif source == 'clipboard':
                    mw.ankiBrain.guiThreadSignaler.importClipboardImageSignal.emit(commandId)
                else:
                    mw.ankiBrain.guiThreadSignaler.importImagesSignal.emit(commandId)

            elif cmd == IC.GENERATE_OCCLUSION_SHAPES:
                try:
                    image_path = resolve_image_path(data.get('imageId') or '')
                    if image_path is None:
                        raise Exception('The image is no longer available. Re-import it and try again.')

                    context = data.get('context') or ''
                    language = data.get('language') or 'English'

                    if self.app.user_mode == UserMode.SERVER:
                        url = data.get('url')
                        access_token = data.get('accessToken')
                        if not url or not access_token:
                            raise Exception('Log in to use AI occlusion suggestions in server mode.')
                        res = await postOcclusionImage(url, image_path, access_token, {
                            'model': data.get('model') or 'gpt-5.6-luna',
                            'language': language,
                            'context': context,
                        })
                        if not isinstance(res, dict) or res.get('status') != 'success':
                            message = (res or {}).get('message') or 'The server could not analyze the image.'
                            raise Exception(message)
                        payload = res.get('data') or {}
                        self.send_cmd(IC.DID_GENERATE_OCCLUSION_SHAPES, {
                            'shapes': payload.get('shapes') or [],
                            'header': payload.get('header') or '',
                            'backExtra': payload.get('backExtra') or '',
                            'user': payload.get('user'),
                        }, commandId=commandId)
                    else:
                        out = await self.app.chatAI.generate_occlusion_shapes(
                            image_path, context=context, language=language)
                        self.send_cmd(IC.DID_GENERATE_OCCLUSION_SHAPES, out, commandId=commandId)
                except Exception as e:
                    self.send_cmd(IC.DID_GENERATE_OCCLUSION_SHAPES, error=str(e), commandId=commandId)

            # ── AnkiBrain Voice (Kokoro TTS) ─────────────────────────────────
            elif cmd == IC.SYNTHESIZE_SPEECH:
                try:
                    voice = data.get('voice') or await self.app.tts.default_voice()
                    speed = data.get('speed') or await self.app.tts.default_speed()
                    # auto: None -> ttsAutoDetect setting; explicit False from
                    # the Settings preview plays the selected voice verbatim.
                    auto = data.get('auto')
                    if auto is None:
                        auto = self.app.tts.auto_enabled()
                    if not auto and not self.app.tts.voice_allowed(voice):
                        # Fixed mode: the requested voice itself needs the ja
                        # pack. With auto on the fallback only matters when
                        # detection abstains — the engine raises the same
                        # sentinel for genuinely Japanese text instead.
                        self.send_cmd(IC.DID_SYNTHESIZE_SPEECH, error='TTS_PACK_MISSING:' + voice,
                                      commandId=commandId)
                    else:
                        out = await self.app.tts.speak_clean(data.get('text', ''), voice=voice,
                                                             speed=speed, auto=auto)
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
                # The setup modal's one way out: cancel the bootstrap, wait
                # for its worker to exit, stop the engine subprocess (on
                # Windows it locks the venv), then delete the whole partial
                # tree on a worker thread. The ack resolves only once cleanup
                # finished, so the UI closes on truth rather than a hope;
                # a still-stopping bootstrap or locked files come back as
                # {ok: False, error} and the modal offers Cancel again.
                #
                # preserveCore (the ja-pack add-on flow): cancel + join only.
                # The core engine predates this attempt and must survive; a
                # partially synced pack is harmless (state groups.ja stays
                # false, Retry/later Repair re-syncs).
                preserve_core = bool(data.get('preserveCore'))
                tts = self.app.tts
                still_running = await asyncio.to_thread(tts.cancel_install_and_wait)
                if still_running:
                    res = {'ok': False,
                           'error': 'The install is still stopping. Try Cancel again in a moment.'}
                elif preserve_core:
                    res = {'ok': True}
                else:
                    try:
                        await tts.stop()
                    except Exception:
                        pass
                    try:
                        await asyncio.to_thread(tts.uninstall_data)
                        res = {'ok': True}
                    except Exception as e:
                        print(f'(ReactBridge) voice cancel cleanup failed: {e}')
                        res = {'ok': False, 'error': str(e)[:300]}
                self.send_cmd(IC.DID_TTS_INSTALL, {'cancelled': True, **res}, commandId=commandId)

            elif cmd == IC.TTS_UNINSTALL:
                # Stop the engine subprocess first (it locks the venv on
                # Windows), then delete the data tree off the UI thread —
                # tens of thousands of files. Acks {ok, error?} on the
                # commandId promise; JS refreshes status from the result.
                if self.app.tts.install_in_progress():
                    self.send_cmd(IC.DID_TTS_UNINSTALL,
                                  {'ok': False,
                                   'error': 'A voice engine install is already running.'},
                                  commandId=commandId)
                else:
                    try:
                        await self.app.tts.stop()
                        await asyncio.to_thread(self.app.tts.uninstall_data)
                        self.send_cmd(IC.DID_TTS_UNINSTALL, {'ok': True}, commandId=commandId)
                    except Exception as e:
                        print(f'(ReactBridge) voice uninstall failed: {e}')
                        self.send_cmd(IC.DID_TTS_UNINSTALL,
                                      {'ok': False, 'error': str(e)[:300]},
                                      commandId=commandId)

            elif cmd == IC.ADD_TTS_AUDIO:
                # Python-side flow (Speak button on a card selection): synth
                # here, then hand the playable file:// url to the webview.
                await self.speak_text(data.get('text', ''))

            elif cmd == IC.GENERATE_CARD_AUDIO:
                await self._a_generate_card_audio(data, commandId)

            elif cmd == IC.CANCEL_CARD_AUDIO:
                # Flag-only: the synth loop re-checks between items, so the
                # one clip currently synthesizing still finishes (its result
                # event is then discarded webview-side). Acks immediately so
                # the webview's promise never hangs.
                if data.get('all'):
                    self._card_audio_cancel_all = True
                for key in (data.get('keys') or []):
                    self._card_audio_cancel_keys.add(str(key))
                self.send_cmd(IC.DID_CANCEL_CARD_AUDIO, {'queued': True}, commandId=commandId)

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

    async def _a_generate_card_audio(self, data: dict, commandId):
        """
        Synthesize the requested card fields one at a time, pushing each
        finished clip as a CARD_AUDIO_RESULT event; the batch settles with a
        DID_GENERATE_CARD_AUDIO ack that resolves the webview's request
        promise.

        Sequential on purpose: ExternalScriptManager matches one response per
        call on a single stdin/stdout pipe, and its write-lock is released
        before the response readline — so concurrent batches could cross
        their responses. An asyncio lock serializes whole batches instead.
        Batch-level problems (engine absent/unsupported) reject the
        promise with a stable sentinel the webview maps to the setup modal.
        """
        items = data.get('items') or []
        if self._card_audio_lock is None:
            self._card_audio_lock = asyncio.Lock()

        async with self._card_audio_lock:
            # Fresh batch: drop cancel marks left over from a previous one so
            # a re-queued batch isn't silently skipped.
            self._card_audio_cancel_all = False
            self._card_audio_cancel_keys = set()

            avail, reason = self.app.tts.availability()
            if avail == 'unsupported':
                self.send_cmd(IC.DID_GENERATE_CARD_AUDIO,
                              error=f'TTS_UNSUPPORTED:{reason}', commandId=commandId)
                return
            if avail == 'absent':
                # JS surfaces the one-click setup dialog and stops here. The
                # batch is NOT parked or replayed after install — the user
                # re-clicks "generate audio" themselves.
                self.send_cmd(IC.DID_GENERATE_CARD_AUDIO, error='TTS_NOT_INSTALLED',
                              commandId=commandId)
                return

            voice = await self.app.tts.default_voice()
            speed = await self.app.tts.default_speed()
            auto = self.app.tts.auto_enabled()
            if not auto and not self.app.tts.voice_allowed(voice):
                # Fixed mode: the batch's voice itself needs the ja pack.
                # With auto on, per-item detection decides — the engine
                # raises TTS_PACK_MISSING only for actual Japanese text.
                self.send_cmd(IC.DID_GENERATE_CARD_AUDIO,
                              error='TTS_PACK_MISSING:' + voice, commandId=commandId)
                return

            generated = failed = cancelled = 0
            for item in items:
                uid = str(item.get('uid') or '')
                field = str(item.get('field') or '')
                if self._card_audio_cancel_all or f'{uid}:{field}' in self._card_audio_cancel_keys:
                    cancelled += 1
                    continue
                try:
                    out = await self.app.tts.speak_clean(
                        item.get('text') or '',
                        voice=voice,
                        speed=speed,
                        is_cloze=bool(item.get('isCloze')),
                        auto=auto,
                    )
                except Exception as e:
                    msg = str(e)
                    if msg.startswith('TTS_PACK_MISSING'):
                        # Engine-side auto-detection hit a language whose pack
                        # is not installed (Japanese today). Abort the batch
                        # and ack the sentinel: JS opens the incremental
                        # add-pack modal, exactly like an absent engine.
                        self.send_cmd(IC.DID_GENERATE_CARD_AUDIO, error=msg, commandId=commandId)
                        return
                    print(f'(ReactBridge) card audio synth failed for {uid}:{field}: {e}')
                    self.send_cmd(IC.CARD_AUDIO_RESULT,
                                  {'uid': uid, 'field': field, 'ok': False,
                                   'error': msg[:200]})
                    failed += 1
                    continue
                if not out or not out.get('path'):
                    # Field scrubbed to nothing (e.g. markup only) — not an
                    # engine error, just nothing to speak.
                    self.send_cmd(IC.CARD_AUDIO_RESULT,
                                  {'uid': uid, 'field': field, 'ok': False,
                                   'error': 'Nothing to speak in that field.'})
                    failed += 1
                    continue
                # Hand JS a media_tmp-relative id (like image ids) plus a
                # file:// url for the in-panel preview.
                audio_id = os.path.relpath(out['path'], MEDIA_TMP_DIR).replace(os.sep, '/')
                self.send_cmd(IC.CARD_AUDIO_RESULT,
                              {'uid': uid, 'field': field, 'ok': True,
                               'id': audio_id, 'url': out.get('url'),
                               'duration_s': out.get('duration_s')})
                generated += 1

            self.send_cmd(IC.DID_GENERATE_CARD_AUDIO,
                          {'generated': generated, 'failed': failed,
                           'cancelled': cancelled},
                          commandId=commandId)

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
            # Open the setup dialog only — the selection is not replayed
            # after install; the user presses Speak again themselves.
            self.send_to_js({'cmd': 'ttsSetupRequired'})
        except Exception as e:
            msg = str(e)
            if msg.startswith('TTS_PACK_MISSING'):
                # Detected (or selected) Japanese without the pack: open the
                # incremental add-pack modal rather than a raw error toast.
                self.send_to_js({'cmd': 'ttsSetupRequired', 'mode': 'add_ja'})
            else:
                print(f'(ReactBridge) speak_text failed: {e}')
                self.send_to_js({'cmd': 'ttsError', 'message': msg})
