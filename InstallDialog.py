import platform
import webbrowser

from aqt.qt import *

from util import run_win_install, run_macos_install, run_linux_install

pyenv_generic_instr = '''
Create a python 3.9.13 venv:
    <p><code>pyenv install 3.9.13</code></p>
    <p><code>pyenv local 3.9.13</code></p>
    <p><code>python -m venv venv</code></p>
    <p>Activate virtualenv:</p>
    <p>Windows: <code>.\\venv\\Scripts\\activate</code></p>
    <p>MacOS/Linux: <code>./venv/bin/activate</code></p>
    <p><code>pip install -r requirements.txt</code></p>
    <p><code></code></p>
'''

win_auto_install_instr = '''
<html>
<p>Windows Install Instructions</p>
<ol>
    <li>Install C++ build tools</li>
    
    <ol>
        <li>Download: <a href="https://visualstudio.microsoft.com/visual-cpp-build-tools">Microsoft Visual C++ Build Tools</a></li>
        <li>Run installer: make sure "Desktop Development with C++" is checked (about 8 GB)</li>
    </ol>
    
    <li><p>Run the Python environment setup script below.</p> 
        <p>It will launch two terminals (one may be be hidden in the taskbar).</p>
        <p><b>Make sure to press a key to continue on the second terminal when prompted.\n</b></p>
    </li>
</ol>
</html>
'''

macos_linux_auto_install_instr = '''
<html><p>
Simply run the setup script below. 
If issues, see manual install instructions.
</p></html>
'''


def show_manual_install_instr():
    webbrowser.open('https://www.reddit.com/r/ankibrain/comments/14ej1bq/how_to_install_ankibrain/')


class InstallDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Install Instructions")

        system = platform.system()

        install_instr = ''
        install_button = None
        if system == 'Windows':
            install_instr = win_auto_install_instr
            install_button = QPushButton('Run Windows Installer')
            install_button.clicked.connect(run_win_install)
        elif system == 'Darwin':
            install_instr = macos_linux_auto_install_instr
            install_button = QPushButton('Run MacOS Installer')
            install_button.clicked.connect(run_macos_install)
        elif system == 'Linux':
            install_instr = macos_linux_auto_install_instr
            install_button = QPushButton('Run Ubuntu/Debian Installer')
            install_button.clicked.connect(run_linux_install)

        label = QLabel()
        label.setText(install_instr)
        label.setOpenExternalLinks(True)

        restart_text = QLabel('\n\nFinal step: Restart Anki\n')

        show_manual_install_instr_button = QPushButton('Show Manual Install Instructions')
        show_manual_install_instr_button.clicked.connect(show_manual_install_instr)

        layout = QVBoxLayout()
        layout.addWidget(label)
        layout.addWidget(install_button)
        layout.addWidget(restart_text)

        layout.addWidget(QLabel('Stuck? Get Help:'))
        layout.addWidget(show_manual_install_instr_button)

        self.setLayout(layout)


def show_install_dialog():
    from aqt import mw
    mw.installDialog.show()
