import asyncio
import json
import platform
import signal
import threading

from anki.hooks import addHook
from aqt import mw, gui_hooks
from aqt.qt import *
from aqt.utils import showInfo
from dotenv import set_key, load_dotenv

from ChatAIModuleAdapter import ChatAIModuleAdapter
from ExplainTalkButtons import ExplainTalkButtons
from InterprocessCommand import InterprocessCommand as IC
from OpenAIAPIKeyDialog import OpenAIAPIKeyDialog
from OllamaAIHostDialog import OllamaAIHostDialog
from PostUpdateDialog import PostUpdateDialog
from SidePanel import SidePanel
from UserModeDialog import show_user_mode_dialog
from card_injection import handle_card_will_show
from changelog import ChangelogDialog
from project_paths import dotenv_path
from util import run_win_install, run_macos_install, run_linux_install, UserMode


class GUIThreadSignaler(QObject):
    """
    Required class for calling UI updates from the non-UI thread.
    """
    resetUISignal = pyqtSignal()
    openFileBrowserSignal = pyqtSignal(int)  # takes commandId so we can resolve the request
    showNoAPIKeyDialogSignal = pyqtSignal()
    sendToJSFromAsyncThreadSignal = pyqtSignal(dict)

    def __init__(self):
        super().__init__()
        self.resetUISignal.connect(self.reset_ui)
        self.openFileBrowserSignal.connect(self.open_file_browser)
        self.showNoAPIKeyDialogSignal.connect(self.show_no_API_key_dialog)
        self.sendToJSFromAsyncThreadSignal.connect(self.send_to_js_from_async_thread)

    def send_to_js_from_async_thread(self, json_dict: dict):
        mw.ankiBrain.sidePanel.webview.send_to_js(json_dict)

    def show_no_API_key_dialog(self):
        showInfo('AnkiBrain has loaded. There is no AI configured, please set up an OpenAI API Key or Ollama.')

    def reset_ui(self):
        mw.reset()

    def open_file_browser(self, commandId):
        print(f'Opening file browser with commandId {commandId}')
        dialog = QFileDialog()
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


class AnkiBrain:
    def __init__(self, user_mode: UserMode = UserMode.LOCAL):
        self.user_mode = user_mode
        self.loop = None
        self.sidePanel = SidePanel("AnkiBrain", mw)
        self.sidePanel.webview.page().loadFinished.connect(self.on_webengine_load_finished)
        self.webview_loaded = False

        self.explainTalkButtons = None
        self.selectedText = ''
        self.chatAI = ChatAIModuleAdapter()  # Requires async starting by calling .start
        self.chatReady = False

        self.openai_api_key_dialog = OpenAIAPIKeyDialog()
        self.openai_api_key_dialog.hide()

        self.ollama_host_dialog = OllamaAIHostDialog()
        self.ollama_host_dialog.hide()

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

        # Set up api key dialog.
        self.openai_api_key_dialog.on_key_save(self.handle_openai_api_key_save)

        # Set up ollama host dialog
        self.ollama_host_dialog.on_key_save(self.handle_ollama_host_key_save)
        self.ollama_host_dialog.input_field.setText(mw.settingsManager.settings.get('ollamaHost', ''))

        # Hook for injecting custom javascript into Anki cards.
        addHook("prepareQA", handle_card_will_show)

        # Hook for Anki's card webview JS function `pycmd`
        gui_hooks.webview_did_receive_js_message.append(self.handle_anki_card_webview_pycmd)

        add_ankibrain_menu_item('Show/Hide AnkiBrain', self.toggle_panel)
        add_ankibrain_menu_item('Switch User Mode...', show_user_mode_dialog)

        if self.user_mode == UserMode.LOCAL:
            add_ankibrain_menu_item('Restart AI...', self.restart_async_members_from_sync)
            add_ankibrain_menu_item('Set OpenAI API Key...', self.show_openai_api_key_dialog)
            add_ankibrain_menu_item('Set Ollama Host...', self.show_ollama_host_dialog)
            add_ankibrain_menu_item('Reinstall...', reinstall)

        # Check if AnkiBrain has been updated.
        has_updated = mw.settingsManager.has_ankibrain_updated()
        if has_updated:
            # If updated, need to have the user reinstall python dependencies.
            # Show PostUpdateDialog.
            mw.updateDialog = PostUpdateDialog(mw)
            mw.updateDialog.show()

        add_ankibrain_menu_item('Show Changelog', show_changelog)
        self.main()

    def on_webengine_load_finished(self):
        print('Webview finished loading.')
        self.webview_loaded = True

    async def load_user_settings(self):
        settings = mw.settingsManager.settings
        print('Sending DID_LOAD_USER_FILES')
        self.reactBridge.send_cmd(IC.DID_LOAD_SETTINGS, settings)

    async def _start_async_members(self):
        """
        Start up all async members here.
        :return:
        """
        # Make sure webview is loaded.
        while not self.webview_loaded:
            print('Webview is not loaded yet, sleeping async...')
            await asyncio.sleep(0.1)

        if self.user_mode == UserMode.LOCAL:
            self.reactBridge.send_cmd(IC.SET_WEBAPP_LOADING_TEXT, {'text': 'Starting AI Engine...'})
            print('Starting AnkiBrain...')
            await self.chatAI.start()
            self.chatReady = True
            print('AnkiBrain ChatAI loaded. App is ready.')

        self.reactBridge.send_cmd(IC.SET_WEBAPP_LOADING_TEXT, {'text': 'Loading your settings...'})
        await self.load_user_settings()
        self.reactBridge.send_cmd(IC.DID_FINISH_STARTUP)

        # Check for key in .env file in user_files
        if self.user_mode == UserMode.LOCAL:
            load_dotenv(dotenv_path, override=True)
            if os.getenv('AI_PROVIDER') not in ['openai', None]:
                return
            if os.getenv('OPENAI_API_KEY') is None or os.getenv('OPENAI_API_KEY') == '':
                print('No API key detected')
                self.guiThreadSignaler.showNoAPIKeyDialogSignal.emit()
            else:
                print(f'Detected API Key: {os.getenv("OPENAI_API_KEY")}')

    async def _stop_async_members(self):
        """
        Stop all async members here.
        :return:
        """
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
        asyncio.run_coroutine_threadsafe(self.restart_async_members(), mw.ankiBrain.loop)

    async def ask_dummy(self, query: str):
        output = await self.chatAI.ask_dummy(query)
        return output

    def handle_openai_api_key_save(self, key):
        self.openai_api_key_dialog.hide()
        set_key(dotenv_path, 'OPENAI_API_KEY', key)
        os.environ['OPENAI_API_KEY'] = key
        self.restart_async_members_from_sync()

    def handle_ollama_host_key_save(self, key):
        self.ollama_host_dialog.hide()
        set_key(dotenv_path, 'OLLAMA_HOST', key)
        os.environ['OLLAMA_HOST'] = key
        mw.settingsManager.edit("ollamaHost", key)
        self.restart_async_members_from_sync()

    def _handle_process_signal(self, signal, frame):
        try:
            self.chatAI.scriptManager.terminate_sync()
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
            asyncio.run_coroutine_threadsafe(self._start_async_members(), loop)
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

    def show_openai_api_key_dialog(self):
        self.openai_api_key_dialog.show()

    def show_ollama_host_dialog(self):
        self.ollama_host_dialog.show()

    def handle_anki_card_webview_pycmd(self, handled, cmd, context):
        try:
            data = json.loads(cmd)
            if data['cmd'] == 'selectedText':
                print('detected text selection')
                self.handle_text_selected(text=data['text'], position=data['position'])
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

    def handle_text_selected(self, text='', position=None):
        if self.explainTalkButtons is not None:
            self.explainTalkButtons.destroy()

        self.selectedText = text

        self.explainTalkButtons = ExplainTalkButtons(mw, position)
        self.explainTalkButtons.on_explain_button_click(self.handle_explain_text_pressed)
        self.explainTalkButtons.on_talk_button_click(self.handle_talk_text_pressed)

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


def reinstall():
    system = platform.system()
    if system == 'Windows':
        run_win_install()
    elif system == 'Darwin':
        run_macos_install()
    elif system == 'Linux':
        run_linux_install()

    showInfo('Terminal updater has been launched. Restart Anki after install is completed.')


def show_changelog():
    mw.changelog = ChangelogDialog(mw)
    mw.changelog.show()


def add_ankibrain_menu_item(name: str, fn):
    action = mw.ankibrain_menu.addAction(name)
    qconnect(action.triggered, fn)

    # Keep track of added actions for removal later if needed.
    mw.menu_actions.append(action)


def remove_ankibrain_menu_actions():
    for action in mw.menu_actions:
        print(f'Removing menu action: {str(action)}')
        mw.form.menubar.removeAction(action)
