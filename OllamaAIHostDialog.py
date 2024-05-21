from aqt.qt import *


class OllamaAIHostDialog(QDialog):
    on_key_save_callback = None

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Set Ollama Host")

        self.label = QLabel()
        self.label.setText('Ollama Host')

        self.input_field = QLineEdit(self)

        self.save_button = QPushButton('Save')
        self.save_button.clicked.connect(self._handle_key_save)

        self.layout = QVBoxLayout()
        self.layout.addWidget(self.label)
        self.layout.addWidget(self.input_field)
        self.layout.addWidget(self.save_button)
        self.setLayout(self.layout)

    def _handle_key_save(self):
        if self.on_key_save_callback is not None:
            self.on_key_save_callback(self.input_field.text())

    def on_key_save(self, cb):
        self.on_key_save_callback = cb
