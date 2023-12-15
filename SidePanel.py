from aqt import mw
from aqt.qt import *

from WebEngineView import WebEngineView
from project_paths import root_project_dir


class SidePanel(QDockWidget):
    def __init__(self, name, mw):
        super().__init__(name, mw)
        self.webview = WebEngineView()
        self.setup_ui()

    def setup_ui(self):
        self.setMinimumWidth(350)

        html_path = os.path.abspath(
            os.path.join(
                root_project_dir, 'webview', 'build', 'index.html'
            )
        )

        self.webview.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        self.webview.load(QUrl.fromLocalFile(html_path))

        self.setWidget(self.webview)
        self.webview.show()

        # Hide on boot if side panel is set to hidden in settings.
        if not mw.settingsManager.get('showSidePanel'):
            self.hide()
