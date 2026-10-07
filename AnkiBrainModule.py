import asyncio
import json
import signal
import threading

from aqt import mw, gui_hooks
from aqt.qt import *
from aqt.utils import showInfo
from dotenv import load_dotenv, dotenv_values

from ChatAIModuleAdapter import ChatAIModuleAdapter
from ExplainTalkButtons import ExplainTalkButtons
from InterprocessCommand import InterprocessCommand as IC
from KokoroTTSAdapter import KokoroTTSAdapter
from PostUpdateDialog import PostUpdateDialog
from SidePanel import SidePanel
from UserModeDialog import show_user_mode_dialog
from card_injection import handle_card_will_show
from card_backup import read_pending_backup
from changelog import ChangelogDialog
from media_images import cleanup_media_tmp, import_image_file, store_imported_image_bytes
from project_paths import dotenv_path, is_dev_checkout
from util import UserMode

#The "GUIThreadSignaler" class allows the non-UI thread to modify/update the UI thread. Some uses include
#resetting the UI, opening a file browser, showing dialogs for missing API keys
class GUIThreadSignaler(QObject):
    """
    Required class for calling UI updates from the non-UI thread.
    """
    resetUISignal = pyqtSignal()
    # (commandId, allow_images): allow_images widens the picker filter so
    # Make Cards can accept documents AND images in one selection.
    openFileBrowserSignal = pyqtSignal(int, bool)
    importImagesSignal = pyqtSignal(int)  # image-occlusion: pick image file(s)
    importClipboardImageSignal = pyqtSignal(int)  # image-occlusion: paste image
    showNoAPIKeyDialogSignal = pyqtSignal()
    sendToJSFromAsyncThreadSignal = pyqtSignal(dict)

    def __init__(self):
        super().__init__()
        self.resetUISignal.connect(self.reset_ui)
        self.openFileBrowserSignal.connect(self.open_file_browser)
        self.importImagesSignal.connect(self.import_images)
        self.importClipboardImageSignal.connect(self.import_clipboard_image)
        self.showNoAPIKeyDialogSignal.connect(self.show_no_API_key_dialog)
        self.sendToJSFromAsyncThreadSignal.connect(self.send_to_js_from_async_thread)

    def send_to_js_from_async_thread(self, json_dict: dict):
        mw.ankiBrain.sidePanel.webview.send_to_js(json_dict)

    def show_no_API_key_dialog(self):
        showInfo('AnkiBrain has loaded. No OpenAI API key is set. Open AnkiBrain Settings → Basic → OpenAI / OpenAI-compatible API, enter your key, and click Save.')

    def reset_ui(self):
        mw.reset()

    def open_file_browser(self, commandId, allow_images=False):
        print(f'Opening file browser with commandId {commandId}')
        dialog = QFileDialog()
        if allow_images:
            # Make Cards picker: documents and image files in one selection.
            # The Import screen's document browser keeps the unfiltered
            # dialog (it must never accept an image as a document).
            name_filter = (
                'Documents and images (*.pdf *.docx *.pptx *.txt *.html '
                '*.png *.jpg *.jpeg *.gif *.webp *.bmp);;'
                'Documents (*.pdf *.docx *.pptx *.txt *.html);;'
                'Images (*.png *.jpg *.jpeg *.gif *.webp *.bmp);;'
                'All files (*)'
            )
            full_paths, _ = dialog.getOpenFileNames(
                None, 'Select document(s) or image(s)', '', name_filter)
        else:
            full_paths, _ = dialog.getOpenFileNames()

        # No files selected (empty array).
        if not full_paths:
            mw.ankiBrain.reactBridge.trigger(IC.DID_CLOSE_DOCUMENT_BROWSER_NO_SELECTIONS, commandId=commandId)
            return

        documents = []
        for path in full_paths:
            file_name_with_extension = os.path.basename(path)
            file_name, extension = os.path.splitext(file_name_with_extension)
            documents.append({
                'file_name_with_extension': os.path.basename(path),
                'file_name': file_name,
                'extension': extension,
                'path': path,
                'size': os.path.getsize(path)
            })

        print(f'Selected documents: {json.dumps(documents)}')

        # user_mode = mw.settingsManager.get_user_mode()
        # if user_mode == UserMode.SERVER:
        mw.ankiBrain.reactBridge.send_cmd(
            IC.DID_SELECT_DOCUMENTS,
            data={'documents': documents},
            commandId=commandId
        )

        # elif user_mode == UserMode.LOCAL:
        #     mw.ankiBrain.reactBridge.trigger(IC.ADD_DOCUMENTS, documents=documents)

    def import_images(self, commandId):
        """
        Image-occlusion import: pick arbitrary image file(s) and copy them
        into media_tmp. Answers DID_IMPORT_IMAGES with registry descriptors
        (ids/urls), or an empty list when nothing was selected.
        """
        dialog = QFileDialog()
        full_paths, _ = dialog.getOpenFileNames(
            None,
            'Select image(s)',
            '',
            'Images (*.png *.jpg *.jpeg *.gif *.webp *.bmp)',
        )

        images = []
        for path in full_paths or []:
            entry = import_image_file(path)
            if entry is not None:
                images.append(entry)

        mw.ankiBrain.reactBridge.send_cmd(IC.DID_IMPORT_IMAGES, {'images': images},
                                          commandId=commandId)

    def import_clipboard_image(self, commandId):
        """
        Image-occlusion import: copy the clipboard image (if any) into
        media_tmp. Answers DID_IMPORT_IMAGES with the descriptor list (empty
        when the clipboard holds no image).
        """
        images = []
        clipboard = QGuiApplication.clipboard()
        image = clipboard.image() if clipboard is not None else None
        if image is not None and not image.isNull():
            buffer = QBuffer()
            buffer.open(QIODevice.OpenModeFlag.WriteOnly)
            if image.save(buffer, 'PNG'):
                entry = store_imported_image_bytes(bytes(buffer.data()), 'clipboard.png')
                if entry is not None:
                    images.append(entry)
            buffer.close()

        mw.ankiBrain.reactBridge.send_cmd(IC.DID_IMPORT_IMAGES, {'images': images},
                                          commandId=commandId)

#The "AnkiBrain" class is the main class. It is responsible for initializing the application, UI setup, file browser interactions,
#webview load handling. 
class AnkiBrain:
    def __init__(self, user_mode: UserMode = UserMode.LOCAL):
        self.user_mode = user_mode
        self.loop = None

        # Purge stale extracted images from previous sessions.
        try:
            cleanup_media_tmp()
        except Exception as e:
            print(f'AnkiBrain media_tmp cleanup failed: {e}')

        self.sidePanel = SidePanel("AnkiBrain", mw)
        self.sidePanel.webview.page().loadFinished.connect(self.on_webengine_load_finished)
        self.webview_loaded = False

        self.explainTalkButtons = None
        self.selectedText = ''
        self.chatAI = ChatAIModuleAdapter()  # Requires async starting by calling .start
        self.chatReady = False

        # AnkiBrain Voice (Kokoro TTS): works in BOTH user modes. Lazy —
        # nothing spawns until a speak request arrives, so server-mode users
        # who never use TTS pay nothing.
        self.tts = KokoroTTSAdapter()

        # Should go last because this object takes self and can call items.
        # Therefore, risk of things not completing setup.
        from ReactBridge import ReactBridge
        self.reactBridge = ReactBridge(self)

        self.guiThreadSignaler = GUIThreadSignaler()

        self.setup_ui()

    def __del__(self):
        self.sidePanel.deleteLater()
        asyncio.run(self.chatAI.stop())

    def setup_ui(self):
        mw.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, self.sidePanel)
        self.sidePanel.resize(500, mw.height())

        # Hook for injecting custom javascript into Anki cards.
        # Anki 25 removed the legacy `prepareQA` hook. Its replacement is the
        # `card_will_show` filter, which is called with (text, card, type) for
        # question and answer content in the reviewer, card preview and template editor.
        gui_hooks.card_will_show.append(handle_card_will_show)

        # Dismiss the Explain/Talk popup when a new card's question is shown, since
        # advancing with the keyboard never fires the card's mousedown handler.
        gui_hooks.reviewer_did_show_question.append(self.handle_card_changed)

        # Hook for Anki's card webview JS function `pycmd`
        gui_hooks.webview_did_receive_js_message.append(self.handle_anki_card_webview_pycmd)

        add_ankibrain_menu_item('Show/Hide AnkiBrain', self.toggle_panel)
        add_ankibrain_menu_item('Switch User Mode...', show_user_mode_dialog)
        add_ankibrain_menu_item('Voice Engine: Install/Repair...', self.install_voice_engine)

        if self.user_mode == UserMode.LOCAL:
            add_ankibrain_menu_item('Restart AI...', self.restart_async_members_from_sync)
            add_ankibrain_menu_item('Local AI Engine: Install/Repair...', self.install_local_engine)
            add_ankibrain_menu_item('Uninstall Local AI Engine...', self.uninstall_local_engine)

        # Check if AnkiBrain has been updated.
        has_updated = mw.settingsManager.has_ankibrain_updated()
        if has_updated:
            # Just the changelog: dependency setup is the panel's job now.
            mw.updateDialog = PostUpdateDialog(mw)
            mw.updateDialog.show()

        add_ankibrain_menu_item('Show Changelog', show_changelog)
        self.main()

    def on_webengine_load_finished(self):
        print('Webview finished loading.')
        self.webview_loaded = True

    async def load_user_settings(self):
        # Copy the settings dict so the runtime-only canToggleDevMode flag
        # never lands in settings.json through a later SettingsManager.save().
        settings = {
            **mw.settingsManager.settings,
            'canToggleDevMode': is_dev_checkout(),
            'recoveredCards': read_pending_backup(),
            # Read straight from .env: load_dotenv runs after this call, and the
            # webview only ever needs to know WHETHER a key exists.
            'hasOpenaiApiKey': bool((dotenv_values(dotenv_path).get('OPENAI_API_KEY') or '').strip()),
            # Custom request headers (e.g. opencode Go's x-opencode-session).
            'openaiExtraHeaders': mw.settingsManager.settings.get('openaiExtraHeaders') or {},
            # Sent automatically on every request; shown read-only in Settings.
            'openaiSessionId': mw.settingsManager.settings.get('openaiSessionId') or '',
        }
        print('Sending DID_LOAD_USER_FILES')
        self.reactBridge.send_cmd(IC.DID_LOAD_SETTINGS, settings)

    async def _start_async_members(self):
        """
        Start up all async members here.
        :return:
        """
        # DID_FINISH_STARTUP is the only thing that clears the webview's global
        # loading state, so it is sent from a finally: a broken or missing local
        # engine must never strand the panel on "Starting AI Engine...".
        try:
            # Make sure webview is loaded.
            while not self.webview_loaded:
                print('Webview is not loaded yet, sleeping async...')
                await asyncio.sleep(0.1)

            if self.user_mode == UserMode.LOCAL:
                self.reactBridge.send_cmd(IC.SET_WEBAPP_LOADING_TEXT, {'text': 'Starting AI Engine...'})
                print('Starting AnkiBrain...')
                status = self.chatAI.status()
                if status['status'] == 'supported-and-installed':
                    try:
                        await self.chatAI.start()
                        self.chatReady = True
                        print('AnkiBrain ChatAI loaded. App is ready.')
                    except Exception as e:
                        # chatAI.start() already recorded the failure in
                        # state.json; surface it in the panel (banner + Repair)
                        # and fall through to the settings/startup part.
                        self.chatReady = False
                        print(f'(AnkiBrain) local engine start failed: {e}')
                        self.reactBridge.send_to_js(
                            {'cmd': 'localEngineStartFailed', 'error': str(e)[:600]})
                else:
                    # absent -> prompt the user; drift -> self-heal silently
                    # (a cache-warm re-sync is seconds and needs no decision).
                    self.reactBridge.send_to_js({
                        'cmd': 'localEngineSetupRequired',
                        'autoStart': status['status'] == 'supported-and-needs-sync',
                        'status': status,
                    })

            self.reactBridge.send_cmd(IC.SET_WEBAPP_LOADING_TEXT, {'text': 'Loading your settings...'})
            await self.load_user_settings()

            # Check for key in .env file in user_files
            if self.user_mode == UserMode.LOCAL:
                load_dotenv(dotenv_path, override=True)
                if os.getenv('OPENAI_API_KEY') is None or os.getenv('OPENAI_API_KEY') == '':
                    print('No API key detected')
                    self.guiThreadSignaler.showNoAPIKeyDialogSignal.emit()
                else:
                    print(f'Detected API Key: {os.getenv("OPENAI_API_KEY")}')
        finally:
            self.reactBridge.send_cmd(IC.DID_FINISH_STARTUP)

    async def _stop_async_members(self):
        """
        Stop all async members here.
        :return:
        """
        # The voice engine is lazy + idle-unloaded, but a session quit while
        # it is warm must not leave torch resident; stop() is a no-op when
        # the engine was never started.
        try:
            await self.tts.stop()
        except Exception as e:
            print(f'(AnkiBrain) tts stop: {e}')

        if self.user_mode == UserMode.LOCAL:
            print('Stopping AnkiBrain...')
            await self.chatAI.stop()
            self.chatReady = False

    async def restart_async_members(self):
        print('Restarting AnkiBrain...')
        print('Setting web app loading: True')
        self.reactBridge.set_webapp_loading(True)
        await self._stop_async_members()
        await self._start_async_members()
        print('Setting web app loading: False')
        self.reactBridge.set_webapp_loading(False)
        self.reactBridge.send_cmd(IC.STOP_LOADERS)

    def restart_async_members_from_sync(self):
        """
        Restart AnkiBrain from a synchronous thread.
        This dispatches a task in the async event loop that runs AnkiBrain.
        This is a synchronous function but is a non-blocking operation.
        :return:
        """
        future = asyncio.run_coroutine_threadsafe(self.restart_async_members(), mw.ankiBrain.loop)
        _report_future_failure(future)

    async def ask_dummy(self, query: str):
        output = await self.chatAI.ask_dummy(query)
        return output

    def _handle_process_signal(self, signal, frame):
        try:
            self.chatAI.scriptManager.terminate_sync()
        except Exception as e:
            print(str(e))
        try:
            if self.tts.script_manager:
                self.tts.script_manager.terminate_sync()
        except Exception as e:
            print(str(e))

        exit(0)

    def main(self):
        """
        Runs AnkiBrain's async members in an asyncio event loop in a separate thread to not block Anki's UI.
        :return:
        """

        # Set up signal handling in main thread.
        signal.signal(signal.SIGINT, self._handle_process_signal)
        signal.signal(signal.SIGTERM, self._handle_process_signal)

        def start_async_loop(_loop):
            asyncio.set_event_loop(_loop)
            _loop.run_forever()

        loop = asyncio.new_event_loop()
        self.loop = loop

        t = threading.Thread(target=start_async_loop, args=(loop,))
        t.daemon = True
        t.start()
        try:
            future = asyncio.run_coroutine_threadsafe(self._start_async_members(), loop)
            _report_future_failure(future)
        except Exception as e:
            print(e)

    def stop_main(self):
        asyncio.run_coroutine_threadsafe(self._stop_async_members(), self.loop)

        # Cancel all tasks on the loop
        for task in asyncio.all_tasks(self.loop):
            task.cancel()

        # Stop the loop
        mw.ankiBrain.loop.call_soon_threadsafe(self.loop.stop)

    def toggle_panel(self):
        if self.sidePanel.isVisible():
            self.sidePanel.hide()
            mw.settingsManager.edit('showSidePanel', False)
        else:
            self.sidePanel.show()
            mw.settingsManager.edit('showSidePanel', True)

    def handle_anki_card_webview_pycmd(self, handled, cmd, context):
        try:
            data = json.loads(cmd)
            if data['cmd'] == 'selectedText':
                print('detected text selection')
                self.handle_text_selected(text=data['text'], position=data['position'], context=context)
                return True, None
            elif data['cmd'] == 'mousedown':
                print('detected mousedown')
                self.handle_mousedown()
                return True, None
            else:
                return handled
        except Exception as e:
            print(e)
            return handled

    def handle_text_selected(self, text='', position=None, context=None):
        if self.explainTalkButtons is not None:
            self.explainTalkButtons.destroy()

        self.selectedText = text

        if not isinstance(position, dict):
            return

        # The position from the card javascript is in the webview's viewport
        # coordinates. Convert it to coordinates within the top-level window that
        # hosts the webview (reviewer, browser preview window, etc.) so the popup
        # lands directly below the selection. The popup is then a plain child
        # widget of that window: top-level popup windows cannot be positioned
        # programmatically under Wayland, which would leave the popup wherever
        # the compositor decides to place it.
        # The webview the message came from must be resolved from the bridge
        # context (see _find_sender_webview), because picking one by size alone
        # lands on the AnkiBrain side panel whenever it is bigger than the card.
        webview = self._find_sender_webview(context)
        parent_win = webview.window()
        page_pos = QPoint(int(position.get('x', 0)), int(position.get('y', 0)))
        win_pos = webview.mapTo(parent_win, page_pos)

        self.explainTalkButtons = ExplainTalkButtons(parent_win, win_pos)
        self.explainTalkButtons.on_explain_button_click(self.handle_explain_text_pressed)
        self.explainTalkButtons.on_talk_button_click(self.handle_talk_text_pressed)
        self.explainTalkButtons.on_speak_button_click(self.handle_speak_text_pressed)

    # Resolve which webview sent a pycmd message. Anki hands the bridge's owner
    # object to the hook as `context`: the reviewer's is the Reviewer instance
    # (whose `.web` is the card webview), the browser's is a Previewer (whose
    # `._web` is the preview webview), the editor's is the Editor instance, and
    # on older Anki versions it is the webview itself. Resolving the actual
    # sender beats any size heuristic: anki's layout puts the card webview and
    # AnkiBrain's dock webview in the same window, and a side panel wider than
    # the card area would otherwise win a biggest-webview contest and drag the
    # popup over the panel.
    def _find_sender_webview(self, context):
        if isinstance(context, QWebEngineView):
            return context
        for attr in ('web', '_web'):
            candidate = getattr(context, attr, None)
            if isinstance(candidate, QWebEngineView):
                return candidate
        # Unknown context: fall back to the largest webview in the main window,
        # excluding AnkiBrain's own side panel so it never skews the result.
        views = [
            view for view in mw.findChildren(QWebEngineView)
            if view is not self.sidePanel.webview
        ]
        return max(views, key=lambda v: v.width() * v.height()) if views else mw

    # Called when a new card's question is shown. Any popup left over from the
    # previous card's selection must disappear.
    def handle_card_changed(self, card):
        self.handle_mousedown()

    # Basically detecting highlight release.
    def handle_mousedown(self):
        if self.explainTalkButtons is not None:
            self.explainTalkButtons.destroy()

        self.selectedText = ''

    def handle_explain_text_pressed(self):
        self.sidePanel.webview.send_to_js({
            'cmd': 'explainSelectedText',
            'text': self.selectedText
        })

        self.explainTalkButtons.destroy()
        self.selectedText = ''

    def handle_talk_text_pressed(self):
        self.sidePanel.webview.send_to_js({
            'cmd': 'talkSelectedText',
            'text': self.selectedText
        })

        self.explainTalkButtons.destroy()
        self.selectedText = ''

    def handle_speak_text_pressed(self):
        # AnkiBrain Voice: synthesize the selection in-process (works in both
        # user modes; nothing to do with the ChatAI subprocess or the server)
        # and let the webview play the returned file:// url.
        text = self.selectedText
        self.explainTalkButtons.destroy()
        self.selectedText = ''
        if not text:
            return
        asyncio.run_coroutine_threadsafe(self.reactBridge.speak_text(text), self.loop)

    def install_voice_engine(self):
        """Menu action: open the webview's Voice Setup modal, which shows the
        size estimate and drives the pinned bootstrap (progress + retry live
        in the React app, not in a Qt dialog)."""
        from aqt import mw
        mw.ankiBrain.sidePanel.show()
        mw.ankiBrain.reactBridge.send_to_js({'cmd': 'ttsSetupRequired'})

    def install_local_engine(self):
        """Menu action: open the webview's Local AI Engine modal, which shows
        the size estimate and drives the pinned bootstrap (progress, cancel,
        repair and retry all live in the React app, not in a Qt dialog)."""
        mw.ankiBrain.sidePanel.show()
        mw.ankiBrain.reactBridge.send_to_js(
            {'cmd': 'localEngineSetupRequired', 'autoStart': False})

    def uninstall_local_engine(self):
        """Menu action: open the modal's uninstall confirmation screen; the
        actual teardown is driven by the webview (LOCAL_ENGINE_UNINSTALL)."""
        mw.ankiBrain.sidePanel.show()
        mw.ankiBrain.reactBridge.send_to_js({'cmd': 'localEngineUninstallPrompt'})


def show_changelog():
    mw.changelog = ChangelogDialog(mw)
    mw.changelog.show()


def _report_future_failure(future):
    """
    Log an exception raised by a fire-and-forget startup/restart task.

    Without this, any failure before DID_FINISH_STARTUP vanished inside the
    concurrent future and the panel silently stayed on the loading screen.
    """
    def _cb(f):
        if f.cancelled():
            return
        exc = f.exception()
        if exc is not None:
            print(f'(AnkiBrain) startup task failed: {exc!r}')

    future.add_done_callback(_cb)


def add_ankibrain_menu_item(name: str, fn):
    action = mw.ankibrain_menu.addAction(name)
    qconnect(action.triggered, fn)

    # Keep track of added actions for removal later if needed.
    mw.menu_actions.append(action)


def remove_ankibrain_menu_actions():
    for action in mw.menu_actions:
        print(f'Removing menu action: {str(action)}')
        mw.form.menubar.removeAction(action)
