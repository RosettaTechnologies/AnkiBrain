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
    def __init__(self, mw, position):
        self.widget = QWidget(mw)

        self.explainButton = QPushButton('Explain', self.widget)
        self.talkButton = QPushButton('Talk', self.widget)

        self.layout = QHBoxLayout()
        self.layout.addWidget(self.explainButton)
        self.layout.addWidget(self.talkButton)
        self.widget.setLayout(self.layout)

        self.position = position
        self.widget.move(position['x'], position['y'] + 50)
        self.widget.setFixedSize(QSize(200, 60))

        self.explainButton.setFixedSize(QSize(90, 40))
        self.explainButton.setStyleSheet(buttonStyle)
        self.talkButton.setFixedSize(QSize(90, 40))
        self.talkButton.setStyleSheet(buttonStyle)

        self.widget.show()

    def on_explain_button_click(self, func):
        self.explainButton.clicked.connect(func)

    def on_talk_button_click(self, func):
        self.talkButton.clicked.connect(func)

    def destroy(self):
        if self.widget is not None:
            self.widget.deleteLater()
            self.widget = None
