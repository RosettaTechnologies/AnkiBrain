from aqt.qt import *

from changelog import get_changelog_html, build_changelog_scroller


class PostUpdateDialog(QDialog):
    """
    Post-update changelog.

    Installing/repairing the LOCAL-mode engine is the side panel's job now (the
    Local AI Engine modal drives the pinned bootstrap), so this dialog no longer
    launches an OS installer and no longer needs a manual-instructions escape
    hatch.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("AnkiBrain Updated")

        updated_text_label = QLabel()
        updated_text_label.setText('AnkiBrain has updated. After updating, please restart Anki.')

        layout = QVBoxLayout()
        layout.addWidget(updated_text_label)
        layout.addWidget(build_changelog_scroller(get_changelog_html()))
        self.setLayout(layout)
