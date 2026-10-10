from aqt.qt import *

buttonStyle = '''
    QPushButton {
        color: black; 
        font-family: Arial;
        background-color: white;
        font-size: 12px; 
        padding: 2px;
    }
    
    QPushButton:hover {
        background-color: gray;
    }
'''


class ExplainTalkButtons:
    def __init__(self, parent, position: QPoint):
        # Plain child widget of the window showing the card. A child widget is
        # positioned by Qt itself, which also works under Wayland, unlike a
        # top-level popup window whose move() is ignored by the compositor.
        self.widget = QWidget(parent)

        self.explainButton = QPushButton('Explain', self.widget)
        self.talkButton = QPushButton('Talk', self.widget)
        self.speakButton = QPushButton('Speak', self.widget)

        self.layout = QHBoxLayout()
        self.layout.addWidget(self.explainButton)
        self.layout.addWidget(self.talkButton)
        self.layout.addWidget(self.speakButton)
        self.widget.setLayout(self.layout)

        self.position = position
        self.widget.setFixedSize(QSize(310, 60))
        self.widget.move(position.x(), position.y() + 6)

        self.explainButton.setFixedSize(QSize(90, 40))
        self.explainButton.setStyleSheet(buttonStyle)
        self.talkButton.setFixedSize(QSize(90, 40))
        self.talkButton.setStyleSheet(buttonStyle)
        self.speakButton.setFixedSize(QSize(90, 40))
        self.speakButton.setStyleSheet(buttonStyle)

        self.widget.show()
        self.widget.raise_()

    def on_explain_button_click(self, func):
        self.explainButton.clicked.connect(func)

    def on_talk_button_click(self, func):
        self.talkButton.clicked.connect(func)

    def on_speak_button_click(self, func):
        self.speakButton.clicked.connect(func)

    def destroy(self):
        if self.widget is not None:
            self.widget.deleteLater()
            self.widget = None
