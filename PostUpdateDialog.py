import platform
import webbrowser

from aqt import mw
from aqt.qt import *

from boot import load_ankibrain
from changelog import get_changelog_html, build_changelog_scroller
from project_paths import root_project_dir
from util import run_win_install, run_macos_install, run_linux_install, UserMode

root_dir = root_project_dir


def show_manual_install_instr():
    webbrowser.open('https://www.reddit.com/r/ankibrain/comments/14ej1bq/how_to_install_ankibrain/')


class PostUpdateDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("AnkiBrain Updated")

        is_local_mode = mw.settingsManager.get_user_mode() == UserMode.LOCAL

        # Set up update text.
        updated_text_label = QLabel()
        updated_str = f"""
            AnkiBrain has updated.
            {"Before using AnkiBrain, please update AnkiBrain's dependencies using the button below." if is_local_mode else ""}
            """
        updated_text_label.setText(updated_str)
        updated_text_label.setOpenExternalLinks(True)

        # Set up the continue update button.
        install_button = QPushButton('Continue AnkiBrain Update')
        system = platform.system()
        if system == 'Windows':
            install_button.clicked.connect(run_win_install)
        elif system == 'Darwin':
            install_button.clicked.connect(run_macos_install)
        elif system == 'Linux':
            install_button.clicked.connect(run_linux_install)

        show_manual_install_instr_button = QPushButton('Show Manual Instructions')
        show_manual_install_instr_button.clicked.connect(show_manual_install_instr)

        # Set up changelog scroller.
        layout = QVBoxLayout()
        layout.addWidget(updated_text_label)
        layout.addWidget(build_changelog_scroller(get_changelog_html()))
        if is_local_mode:
            layout.addWidget(install_button)

        run_ankibrain_label = QLabel()
        run_ankibrain_label.setText("After updating, please restart Anki.")
        start_ankibrain_button = QPushButton("Start AnkiBrain")

        start_ankibrain_button.clicked.connect(self._handle_start_ankibrain_button_click)

        if is_local_mode:
            layout.addWidget(run_ankibrain_label)
            # layout.addWidget(start_ankibrain_button)

            layout.addWidget(QLabel('Stuck? Get Help:'))
            layout.addWidget(show_manual_install_instr_button)

        self.setLayout(layout)

    def _handle_start_ankibrain_button_click(self):
        self.hide()
        load_ankibrain()
