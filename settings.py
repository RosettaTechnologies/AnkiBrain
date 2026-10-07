import json
import os
import uuid
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
    'customPromptChat': '',
    'customPromptMakeCards': '',
    'customPromptTopicExplanation': '',
    'deleteCardsAfterAdding': True,
    "colorMode": "dark",
    "currentVersion": get_ankibrain_version(),
    "documents_saved": [],  # local mode only; server mode keeps documents on the account
    "lifetime_total_cost": 0,
    "user_mode": None,
    "llmModel": 'gpt-5.6-luna',
    'temperature': 0,
    # ── OpenAI / OpenAI-compatible endpoint (LOCAL mode) ─────────────────────
    # The API key itself lives in user_files/.env as OPENAI_API_KEY; only the
    # base URL, the extra request headers and the last-fetched model list live
    # here. An empty base URL means OpenAI's own default endpoint. The headers
    # are merged over AnkiBrain's own User-Agent, so a gateway that routes on
    # custom headers (e.g. opencode Go's x-opencode-session) works.
    'openaiBaseUrl': '',
    'openaiExtraHeaders': {},
    # Stable per-install session id. Every request carries it as
    # x-opencode-session (opencode Go refuses to route without it; other
    # gateways ignore unknown headers). Generated once here, because the merge
    # below only writes keys that are missing.
    'openaiSessionId': str(uuid.uuid4()),
    'openaiModels': [],

    'user': None,
    'devMode': False,
    'showBootReminderDialog': True,
    'showCardBottomHint': True,
    'showSidePanel': True,
    'tempCards': [],
    # ── AnkiBrain Voice (Kokoro TTS) ─────────────────────────────────────────
    # No enable/disable switch: the engine is on when it's installed (Settings
    # screen installs or uninstalls it); speak/audio buttons that find it
    # absent just open the setup dialog.
    'ttsVoice': 'af_heart',        # kokoro voice id; its first letter is the lang code
    # Engine-side source-language detection: foreign text is spoken with a
    # first voice of its detected language; ttsVoice is the fallback for
    # uncertain/unsupported text. On by default.
    'ttsAutoDetect': True,
    'ttsSpeed': 1.0,
    # Review-screen TTS policy: none | front | back | both. Unlike the old
    # ttsEmbedCardAudio/ttsCardAudioSides pair (which synthesized everything
    # inline at ADD_CARDS time), this only drives the webview: it decides
    # whether new cards auto-enqueue GENERATE_CARD_AUDIO jobs and what the
    # "Generate audio for all cards" button targets. Adds never synthesize.
    'ttsCardAudioMode': 'none',
    'ttsEngineRoot': '',           # voice data root override; empty = user_files/voice
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
            # No settings file: a first-time install, or an update from a version
            # that had none (or the user deleted it). Nothing to migrate either
            # way — engine dependencies are provisioned from local_engine/uv.lock
            # by the setup modal, not from the settings file.
            self.b_ankibrain_updated = False
            create_settings_file(self.pth)
            with open(self.pth, 'r') as f:
                self.settings = json.load(f)

    def save(self):
        # Write to a sibling temp file and swap it in: a crash mid-write can
        # never leave a corrupt settings.json (which would lose every setting,
        # including the pending tempCards).
        tmp = self.pth + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            rewrite_json_file(self.settings, f)
        os.replace(tmp, self.pth)

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
