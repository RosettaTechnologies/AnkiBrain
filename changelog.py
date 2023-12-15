from os import path

import markdown
from aqt import mw
from aqt.qt import *

from project_paths import root_project_dir as root_dir


def get_changelog_html() -> str:
    changelog = ''
    changelog_file_path = path.join(root_dir, 'changelog.md')
    if path.isfile(changelog_file_path):
        with open(changelog_file_path, 'r') as f:
            changelog = f.read()

    return markdown.markdown(changelog)


def build_changelog_scroller(changelog_html: str = get_changelog_html()) -> QScrollArea:
    # Set up changelog scroller.
    changelog_label = QLabel()
    changelog_label.setText(changelog_html)
    changelog_label.setWordWrap(True)

    changelog_scroller = QScrollArea()
    changelog_scroller.setWidget(changelog_label)
    changelog_scroller.setWidgetResizable(True)
    changelog_scroller.setFixedHeight(450)

    return changelog_scroller


class ChangelogDialog(QDialog):
    def __init__(self, parent=mw):
        super().__init__(parent)
        self.setWindowTitle('AnkiBrain Changelog')

        changelog_scroller = build_changelog_scroller(get_changelog_html())
        layout = QVBoxLayout()
        layout.addWidget(changelog_scroller)
        self.setLayout(layout)
