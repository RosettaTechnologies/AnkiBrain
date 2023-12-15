import json

from aqt.qt import *

from WebEnginePage import WebEnginePage


class WebEngineView(QWebEngineView):

    def __init__(self, *args, **kwargs):
        super(WebEngineView, self).__init__(*args, **kwargs)
        settings = self.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)

        self._page = WebEnginePage()
        self._page.set_view(self)
        self.setPage(self._page)
        self.load_finished = False
        self.page().loadFinished.connect(self.on_load_finished)

    def on_load_finished(self):
        self.load_finished = True

    def send_to_js(self, json_dict: dict):
        """
        :param json_dict: Dict of form {cmd, param1, param2...}
        :return: None
        """
        if not self.load_finished:
            print('Trying to execute js on not fully loaded webengine page.')
            return

        try:
            self.page().runJavaScript(f'window.receiveFromPython({json.dumps(json_dict)})')
        except Exception as e:
            print(str(e))
