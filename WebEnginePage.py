import webbrowser

from aqt.qt import *


class WebEnginePage(QWebEnginePage):
    react_data_received = pyqtSignal(str)

    def __init__(self):
        super().__init__()
        self.view = None

    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        if 'DATA_FROM_REACT' in message:
            data = message.replace('DATA_FROM_REACT:', '').strip()
            self.react_data_received.emit(data)
        else:
            super().javaScriptConsoleMessage(level, message, lineNumber, sourceID)

    def acceptNavigationRequest(self, url, _type, isMainFrame):
        if _type == QWebEnginePage.NavigationType.NavigationTypeLinkClicked:
            webbrowser.open(url.toString())
            return False
        return QWebEnginePage.acceptNavigationRequest(self, url, _type, isMainFrame)

    def set_view(self, view):
        self.view = view
