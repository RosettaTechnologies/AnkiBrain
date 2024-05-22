import json
from os import path
from typing import Any, Optional

from aqt import mw

from project_paths import settings_path
from util import rewrite_json_file, UserMode


def get_ankibrain_version():
    return mw.CURRENT_VERSION


"""
    There is significance of using .ankibrain-version as the currentVersion in the default settings.

    SCENARIO 1: User installs ankibrain for the first time and has no settings.json. Therefore,
    settings.json will have currentVersion == .ankibrain-version. 
    (Update detection not triggered.)

    SCENARIO 2: User updates ankibrain. In this case, .ankibrain-version goes up, while settings.json
    existed before and currentVersion in settings.json stays the same. Because of this, 
    has_ankibrain_updated will return true, then the settings.json currentVersion will be updated. 
    (Updated detection is triggered.)

    SCENARIO 3: User updates ankibrain and already has had a settings.json file but it does not have
    a currentVersion key. In this case, currentVersion will be == .ankibrain-version. 
    (Update detection not triggered, incorrectly.)

    Because of this -- BEFORE the default settings keys are merged -- the SettingsManager will check 
    if currentVersion doesn't exist, then flag that AnkiBrain must have updated.
"""
default_settings = {
    "aiLanguage": 'English',
    'automaticallyAddCards': True,
    'customPromptChat': '',
    'customPromptMakeCards': '',
    'customPromptTopicExplanation': '',
    'deleteCardsAfterAdding': True,
    "colorMode": "dark",
    "currentVersion": get_ankibrain_version(),
    "documents_saved": [],  # local mode only, server mode uses user.documentsSaved
    "lifetime_total_cost": 0,
    "user_mode": None,
    "llmProvider": 'openai',
    "llmModel": 'gpt-3.5-turbo',
    "ollamaHost": 'https://127.0.0.1:1111434',
    'temperature': 0,
    'user': None,
    'devMode': False,
    'showBootReminderDialog': True,
    'showCardBottomHint': True,
    'showSidePanel': True,
    'tempCards': [],
}


def settings_exists(pth=settings_path):
    return path.isfile(pth)


def create_settings_file(pth=settings_path):
    if not settings_exists(pth):
        with open(pth, 'w') as f:
            json.dump(default_settings, f, indent=2, sort_keys=True)


class SettingsManager:
    pth: str
    settings: dict[str, Any]
    default_settings: dict[str, Any] = default_settings
    b_ankibrain_updated: bool

    def __init__(self, pth=settings_path):
        self.pth = pth

        if settings_exists(self.pth):
            with open(self.pth, 'r') as f:
                self.settings = json.load(f)

                # Run update check first before merging default settings (which has current version number).
                # get_settings_current_version() will return '0' if settings.json has no version info,
                # which means this will evaluate to True.
                self.b_ankibrain_updated = get_ankibrain_version() > self.get_settings_current_version()

                # Check if any default keys missing.
                for k, v in default_settings.items():
                    if k not in self.settings:
                        self.edit(k, v, save=False)

            # Now we store the actual current version in the settings.json file.
            self.set_new_version(get_ankibrain_version(), save=True)
        else:
            # No settings file, this is either a first time install or update from version where there
            # was no settings file (or user deleted it). In the second case there might be bugs
            # if the update adds dependencies to requirements.txt and the user does not update the
            # dependencies. 
            self.b_ankibrain_updated = False
            create_settings_file(self.pth)
            with open(self.pth, 'r') as f:
                self.settings = json.load(f)

    def save(self):
        with open(self.pth, 'w') as f:
            rewrite_json_file(self.settings, f)

    def edit(self, k: str, v: Any, save=True):
        self.settings[k] = v
        if save:
            self.save()

    def replace(self, new_settings: dict[str, Any], save=True):
        self.settings = new_settings
        if save:
            self.save()

    def get(self, k: str):
        return self.settings[k]

    def get_settings_current_version(self):
        v = ''
        if self.settings['currentVersion'] is None:
            """
            In this scenario, we were not storing currentVersion previously. 
            By returning '0', this will always appear as if the app was just updated. 
            """
            return '0'

        v = self.settings['currentVersion']
        return v

    def get_user_mode(self) -> Optional[UserMode]:
        user_mode = self.get('user_mode')
        if user_mode is not None:
            return UserMode(user_mode)
        else:
            return None

    def set_user_mode(self, user_mode: UserMode):
        self.edit('user_mode', user_mode.value)

    def set_new_version(self, version: str, save=True):
        self.edit('currentVersion', version, save=save)

    def add_cost(self, cost: int, save=True):
        self.edit('lifetime_total_cost', cost + self.settings['lifetime_total_cost'], save=save)

    def add_saved_document(self, doc):
        docs = self.get('documents_saved')
        docs.append(doc)
        self.edit('documents_saved', docs)

    def add_saved_documents(self, documents):
        docs = self.get('documents_saved')
        docs.extend(documents)
        self.edit('documents_saved', docs)

    def clear_saved_documents(self):
        self.edit('documents_saved', [])

    def has_ankibrain_updated(self):
        """
        If ankibrain has updated this boot cycle, then this will be true for the duration
        of the runtime of the program (i.e., lifecycle of SettingsManager).
        :return:
        """
        return self.b_ankibrain_updated
