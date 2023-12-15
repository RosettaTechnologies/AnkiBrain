from aqt import mw
from aqt.qt import *

from boot import reload_ankibrain
from util import UserMode


class UserModeDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Welcome to AnkiBrain")

        header = QLabel()
        header.setText('Welcome to AnkiBrain! Please select your user mode.')

        container = QVBoxLayout()
        container.addWidget(header)

        regular_mode_container = QVBoxLayout()
        regular_mode_btn = QPushButton('Regular (recommended)')

        from util import is_windows, is_linux
        if is_windows() or is_linux():
            regular_mode_btn.setStyleSheet("""background-color: #afebf4; color: black;""")

        regular_mode_btn.clicked.connect(handle_server_mode_clicked)
        regular_mode_text = QLabel()
        regular_mode_text.setText(
            """
            <html>
                <p>Easiest to use, fastest speeds. No setup required!</p>
                <ul>
                    <li>Zero setup and gets you studying immediately</li>
                    <li>Uses AnkiBrain's powerful servers for AI</li>
                    <li>Use the same AnkiBrain on different computers with cloud synchronization</li>
                    <li>Fastest option!</li>
                </ul>
            </html>
            """
        )
        regular_mode_container.addWidget(regular_mode_btn)
        regular_mode_container.addWidget(regular_mode_text)

        local_mode_container = QVBoxLayout()
        local_mode_btn = QPushButton('Local (advanced users)')
        local_mode_btn.clicked.connect(handle_local_mode_clicked)
        local_mode_text = QLabel()
        local_mode_text.setText(
            """
            <html>
                <p>For advanced users. Sets up AI Engine on your local computer. Speeds can be slow.</p>
                <ul>
                    <li>Use your own OpenAI API Key</li>
                    <li>Setup may be difficult</li>
                    <li>Requires installation of machine learning dependencies</li>
                    <li>Requires a decent/powerful computer for decent AI speeds</li>
                    <li>All files are stored locally only, does not work across different computers</li>
                    <li>Often slower than regular mode</li>
                </ul>
            </html>
            """
        )
        local_mode_container.addWidget(local_mode_btn)
        local_mode_container.addWidget(local_mode_text)

        buttons = QHBoxLayout()
        buttons.addLayout(regular_mode_container)
        buttons.addLayout(local_mode_container)

        container.addLayout(buttons)
        self.setLayout(container)


def show_user_mode_dialog():
    from aqt import mw
    mw.userModeDialog = UserModeDialog()
    mw.userModeDialog.show()


def handle_local_mode_clicked():
    mw.settingsManager.set_user_mode(UserMode.LOCAL)
    mw.userModeDialog.close()
    reload_ankibrain()


def handle_server_mode_clicked():
    mw.settingsManager.set_user_mode(UserMode.SERVER)
    mw.userModeDialog.close()
    reload_ankibrain()
