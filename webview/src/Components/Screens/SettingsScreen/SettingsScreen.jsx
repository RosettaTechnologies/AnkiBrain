import "./SettingsScreen.css";
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonModal,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from "@ionic/react";
import {
  colorPalette,
  gift,
  language as languageIcon,
  lockClosed,
  options as optionsIcon,
  play,
  star,
  volumeHigh,
} from "ionicons/icons";
import { errorToast, infoToast, successToast } from "../../../api/toast";
import { setLLMModel, setTemperature } from "../../../api/settings";
import { setShowCardBottomHint as setStoreShowCardBottomHint } from "../../../api/redux/slices/showCardBottomHint";
import { useDispatch, useSelector } from "react-redux";
import { isLocalMode } from "../../../api/user";
import { setDevMode } from "../../../api/redux/slices/devMode";
import { setupServerAPI } from "../../../api/server-api/networking";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";
import React, { useState } from "react";
import {
  postPasswordReset,
  postRequestPasswordResetCode,
} from "../../../api/server-api/networking/user";
import { setLanguage } from "../../../api/redux/slices/language";
import { store } from "../../../api/redux";
import { setAutomaticallyAddCards } from "../../../api/redux/slices/automaticallyAddCards";
import { setDeleteCardsAfterAdding } from "../../../api/redux/slices/deleteCardsAfterAdding";
import { setShowBootReminderDialog } from "../../../api/redux/slices/showBootReminderDialog";
import { useEffect } from "react";
import { openSetupModal, refreshTtsStatus, speak } from "../../../api/tts";
import { pyTtsUninstall } from "../../../api/PythonBridge/senders/pyTtsUninstall";
import { editTtsSettingLocal } from "../../../api/redux/slices/tts";

const VoiceSettings = () => {
  const dispatch = useDispatch();
  const tts = useSelector((state) => state.tts);
  const settings = tts.settings;
  const status = tts.status;

  useEffect(() => {
    refreshTtsStatus();
  }, []);

  const setTts = async (key, value) => {
    dispatch(editTtsSettingLocal({ key, value }));
    await pyEditSetting(key, value);
  };

  const languages = (status && status.languages) || {};
  const langCodes = Object.keys(languages);
  const currentVoice = settings.ttsVoice || "af_heart";
  const currentLang =
    langCodes.find((code) => (languages[code].voices || []).includes(currentVoice)) ||
    (currentVoice[0] in languages ? currentVoice[0] : "a");
  const voices = (languages[currentLang] && languages[currentLang].voices) || [];

  const installed = status && status.status === "supported-and-installed";
  const needsSync = status && status.status === "supported-and-needs-sync";
  const unsupported = status && status.status === "unsupported";

  // Uninstall is a destructive, slow (thread-side rmtree of the whole venv
  // tree) action: confirm first, spinner while it runs, then re-fetch status
  // so the buttons flip back to "Install voice engine".
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const diskMb =
    (status && status.estimate && status.estimate.disk_mb) || 1600;
  const jaExtraMb =
    (status && status.estimate && status.estimate.ja_extra_mb) || 300;

  const doUninstall = async () => {
    setUninstalling(true);
    try {
      const res = await pyTtsUninstall();
      if (res && res.ok) {
        successToast(
          "Voice Engine Removed",
          "The Kokoro voice engine has been uninstalled. You can reinstall it any time from this screen."
        );
      } else {
        errorToast(
          "Uninstall Failed",
          String((res && res.error) || "Could not remove the voice engine.").slice(0, 300)
        );
      }
    } catch (e) {
      errorToast("Uninstall Failed", String(e && e.message ? e.message : e).slice(0, 300));
    } finally {
      await refreshTtsStatus();
      setUninstalling(false);
      setConfirmUninstall(false);
    }
  };

  return (
    <div className="SettingsScreen-voice">
      <hr className="SettingsScreen-divider" />
      <div className="SettingsScreen-sectionHeader">
        <IonIcon className="SettingsScreen-sectionIcon" icon={volumeHigh} />
        <span className="SettingsScreen-sectionTitle">
          Voice (Text-to-Speech)
        </span>
      </div>

      {!unsupported && (
        <p className="SettingsScreen-hint">
          {installed
            ? "Kokoro-82M engine installed" +
              (status.ja_pack ? " (incl. Japanese)" : "") +
              "."
            : needsSync
              ? "Engine needs a small update after an AnkiBrain upgrade."
              : "Not installed yet — one click below (~" +
                ((status && status.estimate && status.estimate.download_mb) || 700) +
                " MB)."}
        </p>
      )}
      {unsupported && (
        <p className="SettingsScreen-hint">{status.reason}</p>
      )}

      {!unsupported && (
        <IonButton
          className="SettingsScreen-wideBtn"
          color={installed ? "danger" : "light"}
          fill={installed ? "outline" : "solid"}
          onClick={() => {
            if (installed) {
              setConfirmUninstall(true);
            } else {
              openSetupModal();
            }
          }}
        >
          {installed
            ? "Uninstall voice engine"
            : needsSync
              ? "Update voice engine"
              : "Install voice engine"}
        </IonButton>
      )}

      {!unsupported && installed && !status.ja_pack && (
        <IonButton
          className="SettingsScreen-wideBtn"
          fill="outline"
          onClick={() => openSetupModal("add_ja")}
        >
          Add Japanese language pack (+{jaExtraMb} MB)
        </IonButton>
      )}

      <IonModal
        isOpen={confirmUninstall}
        backdropDismiss={!uninstalling}
        onDidDismiss={() => {
          if (!uninstalling) setConfirmUninstall(false);
        }}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Uninstall voice engine?</IonTitle>
            <IonButtons slot="end">
              <IonButton
                disabled={uninstalling}
                onClick={() => setConfirmUninstall(false)}
              >
                Close
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <p className="SettingsScreen-hint">
            This removes the Kokoro voice engine (~{diskMb} MB) from this
            computer. Audio already added to your Anki decks is not affected.
            You can reinstall with one click any time.
          </p>
          <IonButton
            expand="block"
            color="danger"
            disabled={uninstalling}
            onClick={doUninstall}
          >
            {uninstalling ? (
              <IonSpinner name="crescent" />
            ) : (
              "Uninstall voice engine"
            )}
          </IonButton>
        </IonContent>
      </IonModal>

      {!unsupported && installed && (
        <>
          <label className="SettingsScreen-label">Language</label>
          <IonSelect
            className="SettingsScreen-select"
            value={currentLang}
            interface="popover"
            onIonChange={(e) => {
              const code = e.detail.value;
              const first = (languages[code].voices || [])[0];
              if (first) setTts("ttsVoice", first);
            }}
          >
            {langCodes.map((code) => (
              <IonSelectOption key={code} value={code}>
                {languages[code].name}
                {languages[code].pack === "ja" && !status.ja_pack
                  ? " (needs ja pack)"
                  : ""}
              </IonSelectOption>
            ))}
          </IonSelect>

          <label className="SettingsScreen-label">Voice</label>
          <IonSelect
            className="SettingsScreen-select"
            value={currentVoice}
            interface="popover"
            onIonChange={async (e) => {
              await setTts("ttsVoice", e.detail.value);
            }}
          >
            {voices.map((v) => (
              <IonSelectOption key={v} value={v}>
                {v}
              </IonSelectOption>
            ))}
          </IonSelect>

          <IonCheckbox
            className="SettingsScreen-checkbox"
            checked={settings.ttsAutoDetect !== false}
            onIonChange={async (e) => {
              await setTts("ttsAutoDetect", e.detail.checked);
            }}
          >
            <span className="SettingsScreen-checkboxLabel">
              Auto-detect language from text
            </span>
          </IonCheckbox>
          <p className="SettingsScreen-hint SettingsScreen-hint--small">
            Speaks each text with a voice for its detected language (e.g.
            Spanish text uses a Spanish voice). The selected voice is used
            when the language can&apos;t be detected.
          </p>

          <label className="SettingsScreen-label">
            Speed ({Number(settings.ttsSpeed || 1).toFixed(2)}×)
          </label>
          <IonRange
            className="SettingsScreen-range"
            min={0.5}
            max={2}
            step={0.05}
            value={Number(settings.ttsSpeed || 1)}
            onIonChange={(v) => {
              dispatch(editTtsSettingLocal({ key: "ttsSpeed", value: v.detail.value }));
            }}
            onIonKnobMoveEnd={async (v) => {
              await setTts("ttsSpeed", v.detail.value);
            }}
          />

          <IonButton
            className="SettingsScreen-wideBtn"
            fill="outline"
            onClick={() => {
              // Preview the SELECTED voice verbatim: auto-detection would
              // otherwise route this English sentence to the English default
              // voice and hide the user's non-English pick.
              speak("Hello! This is how AnkiBrain voice sounds.", { auto: false });
            }}
          >
            <IonIcon slot="start" icon={play} />
            Preview voice
          </IonButton>
        </>
      )}
      <hr className="SettingsScreen-divider" />
    </div>
  );
};

const AdvancedSettings = () => {
  const temperature = useSelector((state) => state.appSettings.ai.temperature);
  const llm = useSelector((state) => state.appSettings.ai.llmModel);
  const dispatch = useDispatch();
  const devMode = useSelector((state) => state.devMode.value);
  const apiBaseUrl = useSelector((state) => state.apiBaseUrl.value);

  return (
    <div className="SettingsScreen-advanced">
      <div className="SettingsScreen-field">
        <label className="SettingsScreen-label">
          Large Language Model (LLM)
        </label>
        <IonSelect
          className="SettingsScreen-select SettingsScreen-select--wide"
          value={llm}
          interface="popover"
          onIonChange={async (e) => {
            await setLLMModel(e.detail.value);
            if (isLocalMode()) {
              successToast(
                "LLM Changed",
                "The AI Language Model has been changed. Please restart AnkiBrain for this change to take effect."
              );
            }
          }}
        >
          <IonSelectOption value={"gpt-3.5-turbo"}>
            gpt-3.5-turbo (legacy - will stop working October 2026)
          </IonSelectOption>
          <IonSelectOption value={"gpt-4"}>
            gpt-4 (expensive) (legacy - will stop working October 2026)
          </IonSelectOption>
          <IonSelectOption value={"gpt-5.6-sol"}>
            GPT-5.6 Sol (very expensive)
          </IonSelectOption>
          <IonSelectOption value={"gpt-5.6-terra"}>
            GPT-5.6 Terra (expensive)
          </IonSelectOption>
          <IonSelectOption value={"gpt-5.6-luna"}>
            GPT-5.6 Luna (best value)
          </IonSelectOption>
        </IonSelect>
      </div>

      <div className="SettingsScreen-field">
        <label className="SettingsScreen-label">Temperature (0-1)</label>
        <IonInput
          className="SettingsScreen-input"
          fill="solid"
          value={temperature}
          onKeyDown={(e) => {
            const allowedKeys = ["Backspace", "."];
            const isNumber = !isNaN(Number(e.key));
            const isAllowed = isNumber || allowedKeys.includes(e.key);
            if (!isAllowed) {
              e.preventDefault();
            }
          }}
          onIonInput={async (e) => {
            const isNumber = !isNaN(Number(e.detail.value));
            if (isNumber) {
              const number = Number(e.detail.value);
              if (number < 0 || number > 1) {
                errorToast(
                  "Invalid Temperature",
                  "Please enter a temperature between 0 and 1."
                );
              } else {
                await setTemperature(e.detail.value);
                if (isLocalMode()) {
                  successToast(
                    "Temperature Changed",
                    "The AI temperature has been changed. Please restart AnkiBrain for this change to take effect."
                  );
                }
              }
            }
          }}
        />
      </div>

      <hr className="SettingsScreen-divider" />

      <div className="SettingsScreen-toggleRow">
        <span className="SettingsScreen-label">Developer Mode</span>
        <IonToggle
          checked={devMode}
          onIonChange={async (e) => {
            if (window.developerMode) {
              let newDevMode = e.detail.checked;
              await pyEditSetting("devMode", newDevMode);
              dispatch(setDevMode(newDevMode));
              setupServerAPI();
            } else {
              infoToast(
                "No Access",
                "You do not have access to developer mode at this time."
              );
              // The store was not updated; put the toggle back.
              e.target.checked = devMode;
            }
          }}
        />
      </div>

      <p className="SettingsScreen-serverLine">Server: {apiBaseUrl}</p>
    </div>
  );
};

export const SettingsScreen = () => {
  const [tab, setTab] = useState("basic");
  const [passwordResetMode, setPasswordResetMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  const [showUserInterfaceSettings, setShowUserInterfaceSettings] =
    useState(false);
  const showBootReminderDialog = useSelector(
    (state) => state.showBootReminderDialog.value
  );
  const showCardBottomHint = useSelector(
    (state) => state.showCardBottomHint.value
  );
  const automaticallyAddCards = useSelector(
    (state) => state.automaticallyAddCards.value
  );
  const deleteCardsAfterAdding = useSelector(
    (state) => state.deleteCardsAfterAdding.value
  );

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const language = useSelector((store) => store.language.value);
  const [selectedLanguage, setSelectedLanguage] = useState(
    store.getState().language.value
  );

  const [showCustomLanguageInput, setShowCustomLanguageInput] = useState(false);

  const pwResetClose = () => {
    setPasswordResetMode(false);
  };

  const setShowCardBottomHint = async (value) => {
    dispatch(setStoreShowCardBottomHint(value));
    await pyEditSetting("showCardBottomHint", value);
  };

  const handleChangeAutoAddCards = async (value) => {
    dispatch(setAutomaticallyAddCards(value));
    await pyEditSetting("automaticallyAddCards", value);
  };

  const handleChangeDeleteCardsAfterAdding = async (value) => {
    dispatch(setDeleteCardsAfterAdding(value));
    await pyEditSetting("deleteCardsAfterAdding", value);
  };

  const dispatch = useDispatch();

  return (
    <>
      <IonModal isOpen={passwordResetMode} onDidDismiss={pwResetClose}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Reset Password</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={pwResetClose}>Close</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <div className="SettingsScreen-pwReset">
            <div className="SettingsScreen-field">
              <label className="SettingsScreen-label">Email</label>
              <IonInput
                className="SettingsScreen-input"
                fill="solid"
                value={email}
                placeholder={"Enter your email address..."}
                onIonInput={(e) => {
                  setEmail(e.detail.value || "");
                }}
              />
            </div>
            <IonButton
              color="accent"
              onClick={async () => {
                let res = await postRequestPasswordResetCode(email);
                if (res.status === "success") {
                  successToast(
                    "Password Reset Email",
                    "A password reset verification code has been sent to the email address given."
                  );
                }
              }}
            >
              Send verification code
            </IonButton>

            <hr className="SettingsScreen-divider" />

            <div className="SettingsScreen-field">
              <label className="SettingsScreen-label">New Password</label>
              <IonInput
                className="SettingsScreen-input"
                fill="solid"
                value={password}
                type={"password"}
                placeholder={"Enter new password..."}
                onIonInput={(e) => {
                  setPassword(e.detail.value || "");
                }}
              />
            </div>

            <div className="SettingsScreen-field">
              <label className="SettingsScreen-label">Verification Code</label>
              <IonInput
                className="SettingsScreen-input"
                fill="solid"
                value={verificationCode}
                placeholder={"Enter verification code..."}
                onIonInput={(e) => {
                  setVerificationCode(e.detail.value || "");
                }}
              />
            </div>
            <IonButton
              color="secondary"
              onClick={async () => {
                let res = await postPasswordReset(
                  email,
                  password,
                  verificationCode
                );

                if (!res) {
                  errorToast("Request error", res);
                  return;
                }

                if (res && res.status === "success") {
                  successToast(
                    "Password Reset Successfully",
                    "Your password has been reset. You can now login with your new password."
                  );
                }
              }}
            >
              Change Password
            </IonButton>
          </div>
        </IonContent>
      </IonModal>

      <div className="SettingsScreen">
        <IonSegment
          className="SettingsScreen-segment"
          value={tab}
          onIonChange={(e) => setTab(e.detail.value)}
        >
          <IonSegmentButton value="basic">
            <IonLabel>Basic</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="advanced">
            <IonLabel>Advanced</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        {tab === "basic" && (
          <div className="SettingsScreen-content">
            <IonButton
              className="SettingsScreen-wideBtn"
              color="accent"
              href={"https://donate.stripe.com/8x25kx8ZM7dx66RcMa7N600"}
            >
              <IonIcon slot="start" icon={gift} />
              Donate
            </IonButton>
            <IonButton
              className="SettingsScreen-wideBtn"
              color="secondary"
              href={"https://ankiweb.net/shared/info/1915225457"}
            >
              <IonIcon slot="start" icon={star} />
              Review on AnkiWeb
            </IonButton>

            <hr className="SettingsScreen-divider" />

            <IonButton
              className="SettingsScreen-wideBtn"
              color="light"
              onClick={() => {
                setShowUserInterfaceSettings(true);
              }}
            >
              <IonIcon slot="start" icon={optionsIcon} />
              User Interface Settings
            </IonButton>

            <IonModal
              isOpen={showUserInterfaceSettings}
              onDidDismiss={() => {
                setShowUserInterfaceSettings(false);
              }}
            >
              <IonHeader>
                <IonToolbar>
                  <IonTitle>User Interface Settings</IonTitle>
                  <IonButtons slot="end">
                    <IonButton onClick={() => setShowUserInterfaceSettings(false)}>
                      Close
                    </IonButton>
                  </IonButtons>
                </IonToolbar>
              </IonHeader>
              <IonContent className="ion-padding">
                <div className="SettingsScreen-toggleList">
                  <div className="SettingsScreen-toggleItem">
                    <div className="SettingsScreen-toggleText">
                      <span>
                        Automatically add every 100 cards to Anki with
                        auto-clearing (recommended)
                      </span>
                      <p className="SettingsScreen-hint SettingsScreen-hint--small">
                        If this option is enabled, AnkiBrain will automatically
                        add every 100 cards to any selected deck. This will also
                        clear your AnkiBrain cards after they are added to Anki,
                        in order to prevent duplicates in your deck. This option
                        is recommended, because large numbers of cards (in the
                        thousands) can cause the program to lag/freeze and you
                        may lose your progress.
                      </p>
                    </div>
                    <IonToggle
                      checked={automaticallyAddCards}
                      onIonChange={async (e) => {
                        await handleChangeAutoAddCards(e.detail.checked);
                      }}
                    />
                  </div>
                  <div className="SettingsScreen-toggleItem">
                    <div className="SettingsScreen-toggleText">
                      <span>
                        When I click "Add Cards to Anki", clear my AnkiBrain
                        cards
                      </span>
                      <p className="SettingsScreen-hint SettingsScreen-hint--small">
                        If this option is enabled, then after you add cards to an
                        Anki deck, cards inside of AnkiBrain will be cleared.
                      </p>
                    </div>
                    <IonToggle
                      checked={deleteCardsAfterAdding}
                      onIonChange={async (e) => {
                        await handleChangeDeleteCardsAfterAdding(
                          e.detail.checked
                        );
                      }}
                    />
                  </div>
                  <div className="SettingsScreen-toggleItem">
                    <div className="SettingsScreen-toggleText">
                      <span>
                        Show AnkiBrain interaction hint at the bottom of Anki
                        cards while reviewing
                      </span>
                      <p className="SettingsScreen-hint SettingsScreen-hint--small">
                        If this option is enabled, then when you are reviewing
                        cards you will see the small bottom text "Highlight any
                        text on this card to interact with AnkiBrain"
                      </p>
                    </div>
                    <IonToggle
                      checked={showCardBottomHint}
                      onIonChange={async (e) => {
                        await setShowCardBottomHint(e.detail.checked);
                      }}
                    />
                  </div>
                  <div className="SettingsScreen-toggleItem">
                    <div className="SettingsScreen-toggleText">
                      <span>
                        Show donation/review reminder when AnkiBrain starts
                      </span>
                    </div>
                    <IonToggle
                      checked={showBootReminderDialog}
                      onIonChange={async (e) => {
                        dispatch(
                          setShowBootReminderDialog(e.detail.checked)
                        );
                        await pyEditSetting(
                          "showBootReminderDialog",
                          e.detail.checked
                        );
                      }}
                    />
                  </div>
                </div>
              </IonContent>
            </IonModal>

            <IonButton
              className="SettingsScreen-wideBtn"
              color="light"
              onClick={() => {
                setShowLanguageModal(true);
              }}
            >
              <IonIcon slot="start" icon={languageIcon} />
              Change AI Language
            </IonButton>

            <IonModal
              isOpen={showLanguageModal}
              onDidDismiss={() => {
                setShowLanguageModal(false);
              }}
            >
              <IonHeader>
                <IonToolbar>
                  <IonTitle>AnkiBrain AI Language</IonTitle>
                  <IonButtons slot="end">
                    <IonButton onClick={() => setShowLanguageModal(false)}>
                      Close
                    </IonButton>
                  </IonButtons>
                </IonToolbar>
              </IonHeader>
              <IonContent className="ion-padding">
                <p className="SettingsScreen-hint">
                  Please select your language below, or type in a custom
                  language. This option changes the output text of AI responses.
                  This does not change AnkiBrain's user interface language.
                </p>
                <IonSelect
                  className="SettingsScreen-select SettingsScreen-select--wide"
                  value={selectedLanguage !== "Other" ? selectedLanguage : "Other"}
                  interface="popover"
                  onIonChange={async (e) => {
                    let newSelectedLanguage = e.detail.value;
                    if (newSelectedLanguage !== "Other") {
                      setShowCustomLanguageInput(false);
                      setSelectedLanguage(newSelectedLanguage);
                      dispatch(setLanguage(newSelectedLanguage));
                      await pyEditSetting("aiLanguage", newSelectedLanguage);
                    } else {
                      setShowCustomLanguageInput(true);
                      setSelectedLanguage(newSelectedLanguage);
                    }
                  }}
                >
                  <IonSelectOption value={"English"}>English</IonSelectOption>
                  <IonSelectOption value={"Spanish"}>Spanish</IonSelectOption>
                  <IonSelectOption value={"Albanian"}>Albanian</IonSelectOption>
                  <IonSelectOption value={"Arabic"}>Arabic</IonSelectOption>
                  <IonSelectOption value={"Armenian"}>Armenian</IonSelectOption>
                  <IonSelectOption value={"Azerbaijani"}>
                    Azerbaijani
                  </IonSelectOption>
                  <IonSelectOption value={"Belarusian"}>
                    Belarusian
                  </IonSelectOption>
                  <IonSelectOption value={"Bengali"}>Bengali</IonSelectOption>
                  <IonSelectOption value={"Bulgarian"}>Bulgarian</IonSelectOption>
                  <IonSelectOption value={"Bosnian"}>Bosnian</IonSelectOption>
                  <IonSelectOption value={"Chinese (Mandarin)"}>
                    Chinese (Mandarin)
                  </IonSelectOption>
                  <IonSelectOption value={"Chinese (Cantonese)"}>
                    Chinese (Cantonese)
                  </IonSelectOption>
                  <IonSelectOption value={"Croatian"}>Croatian</IonSelectOption>
                  <IonSelectOption value={"Czech"}>Czech</IonSelectOption>
                  <IonSelectOption value={"Danish"}>Danish</IonSelectOption>
                  <IonSelectOption value={"Dutch"}>Dutch</IonSelectOption>
                  <IonSelectOption value={"Estonian"}>Estonian</IonSelectOption>
                  <IonSelectOption value={"Farsi (Persian)"}>
                    Farsi (Persian)
                  </IonSelectOption>
                  <IonSelectOption value={"Filipino"}>Filipino</IonSelectOption>
                  <IonSelectOption value={"Finnish"}>Finnish</IonSelectOption>
                  <IonSelectOption value={"French"}>French</IonSelectOption>
                  <IonSelectOption value={"German"}>German</IonSelectOption>
                  <IonSelectOption value={"Greek"}>Greek</IonSelectOption>
                  <IonSelectOption value={"Hindi"}>Hindi</IonSelectOption>
                  <IonSelectOption value={"Icelandic"}>Icelandic</IonSelectOption>
                  <IonSelectOption value={"Indonesian"}>
                    Indonesian
                  </IonSelectOption>
                  <IonSelectOption value={"Irish (Gaelic)"}>
                    Irish (Gaelic)
                  </IonSelectOption>
                  <IonSelectOption value={"Italian"}>Italian</IonSelectOption>
                  <IonSelectOption value={"Japanese"}>Japanese</IonSelectOption>
                  <IonSelectOption value={"Kazakh"}>Kazakh</IonSelectOption>
                  <IonSelectOption value={"Khmer"}>Khmer</IonSelectOption>
                  <IonSelectOption value={"Korean"}>Korean</IonSelectOption>
                  <IonSelectOption value={"Kurdish"}>Kurdish</IonSelectOption>
                  <IonSelectOption value={"Hebrew"}>Hebrew</IonSelectOption>
                  <IonSelectOption value={"Hungarian"}>Hungarian</IonSelectOption>
                  <IonSelectOption value={"Malay"}>Malay</IonSelectOption>
                  <IonSelectOption value={"Mongolian"}>Mongolian</IonSelectOption>
                  <IonSelectOption value={"Norwegian"}>Norwegian</IonSelectOption>
                  <IonSelectOption value={"Polish"}>Polish</IonSelectOption>
                  <IonSelectOption value={"Portuguese"}>
                    Portuguese
                  </IonSelectOption>
                  <IonSelectOption value={"Romanian"}>Romanian</IonSelectOption>
                  <IonSelectOption value={"Russian"}>Russian</IonSelectOption>
                  <IonSelectOption value={"Serbian"}>Serbian</IonSelectOption>
                  <IonSelectOption value={"Swedish"}>Swedish</IonSelectOption>
                  <IonSelectOption value={"Thai"}>Thai</IonSelectOption>
                  <IonSelectOption value={"Turkish"}>Turkish</IonSelectOption>
                  <IonSelectOption value={"Ukrainian"}>Ukrainian</IonSelectOption>
                  <IonSelectOption value={"Urdu"}>Urdu</IonSelectOption>
                  <IonSelectOption value={"Vietnamese"}>
                    Vietnamese
                  </IonSelectOption>
                  <IonSelectOption value={"Other"}>Other</IonSelectOption>
                </IonSelect>
                {showCustomLanguageInput && (
                  <IonInput
                    className="SettingsScreen-input"
                    fill="solid"
                    placeholder={"Custom language..."}
                    value={language}
                    onIonInput={async (e) => {
                      dispatch(setLanguage(e.detail.value || ""));
                      await pyEditSetting("aiLanguage", e.detail.value || "");
                    }}
                  />
                )}
              </IonContent>
            </IonModal>

            <VoiceSettings />

            <IonButton
              className="SettingsScreen-wideBtn"
              color="light"
              onClick={() => {
                infoToast(
                  "Coming Soon",
                  "This feature is coming soon! Hang tight!"
                );
              }}
            >
              <IonIcon slot="start" icon={colorPalette} />
              Appearance & Themes
            </IonButton>

            {!isLocalMode() && (
              <IonButton
                className="SettingsScreen-wideBtn"
                color="light"
                onClick={() => {
                  setPasswordResetMode(true);
                }}
              >
                <IonIcon slot="start" icon={lockClosed} />
                Reset Password
              </IonButton>
            )}

            <hr className="SettingsScreen-divider" />

            <IonButton
              className="SettingsScreen-wideBtn"
              color="light"
              href={"https://forms.gle/hLBTRr1d13txDwzg8"}
            >
              Submit Feature Request
            </IonButton>
            <IonButton
              className="SettingsScreen-wideBtn"
              color="light"
              href={"https://forms.gle/jVV6Lxdp6q7zVNrG6"}
            >
              Submit Bug Report
            </IonButton>
          </div>
        )}

        {tab === "advanced" && <AdvancedSettings />}
      </div>
    </>
  );
};
