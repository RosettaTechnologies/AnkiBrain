import { handleExplainSelectedText } from "./receivers/handleExplainSelectedText";
import { handleDidExplainTopic } from "./receivers/handleDidExplainTopic";
import { handleTalkSelectedText } from "./receivers/handleTalkSelectedText";
import { addAIMessageToStore } from "../chat";
import { InterprocessCommand as IC } from "./InterprocessCommand";
import { playTtsUrl } from "../tts/player";
import { openSetupModal, refreshTtsStatus } from "../tts";
import { openLocalEngineModal, refreshLocalEngineStatus } from "../localEngine";
import { pyLocalEngineInstall } from "./senders/pyLocalEngine";
import { handleCardAudioResult } from "../cardAudio";
import {
  setTtsInstallDone,
  setTtsInstallEvent,
  setTtsSettings,
} from "../redux/slices/tts";
import {
  setLocalEngineInstallDone,
  setLocalEngineInstallEvent,
  setLocalEngineStartError,
} from "../redux/slices/localEngine";
import { setDocuments } from "../redux/slices/documentsSlice";
import { store } from "../redux";
import { setBoolGlobalLoadingIndicator } from "../redux/slices/bGlobalLoadingIndicator";
import { setChatLoading } from "../redux/slices/chatLoading";
import { setDocumentsLoading } from "../redux/slices/documentsLoadingSlice";
import { setAppAlertModal } from "../redux/slices/appAlertModal";
import { errorToast, infoToast } from "../toast";
import { setPyCommandLock } from "../redux/slices/pyCommandLock";
import { stopAllLoaders } from "../redux/stopAllLoaders";
import { setCurrentVersion } from "../redux/slices/currentVersion";
import { setLifetimeCost, setSessionCost } from "../redux/slices/cost";
import {
  setHasOpenaiApiKey,
  setLLMModel,
  setOpenAIBaseUrl,
  setOpenAIExtraHeaders,
  setOpenAISessionId,
  setOpenAIModels,
  setTemperature,
} from "../redux/slices/appSettings";
import { setLoadingText } from "../redux/slices/loadingText";
import { setUserMode } from "../redux/slices/userMode";
import { getUser } from "../server-api/networking/user";
import { logout, setUser } from "../user";
import { setDevMode } from "../redux/slices/devMode";
import { setupServerAPI } from "../server-api/networking";
import { setColorMode } from "../redux/slices/colorMode";
import { Button, Checkbox, Flex, Text } from "@chakra-ui/react";
import { AiOutlineSmile } from "react-icons/ai";
import { VscHeartFilled } from "react-icons/vsc";
import { BiDonateHeart } from "react-icons/bi";
import { MdOutlineRateReview } from "react-icons/md";
import React from "react";
import { setLanguage } from "../redux/slices/language";
import { setCards } from "../redux/slices/cards";
import { setShowCardBottomHint } from "../redux/slices/showCardBottomHint";
import { setDeleteCardsAfterAdding } from "../redux/slices/deleteCardsAfterAdding";
import { setShowBootReminderDialog } from "../redux/slices/showBootReminderDialog";
import { pyEditSetting } from "./senders/pyEditSetting";
import { pyClearCardsBackup } from "./senders/pyCardBackup";
import { setAppDidBoot } from "../redux/slices/appDidBoot";
import { setCheckedAuth } from "../redux/slices/checkedAuth";
import {
  setCustomPromptChat,
  setCustomPromptMakeCards,
  setCustomPromptTopicExplanation,
} from "../redux/slices/customPrompts";

/**
 * Switchboard for incoming python commands.
 * @param pyResponseObject - Because of the way that the parent python process injects the json object,
 * we actually receive a full object and not a string.
 * @param dispatch
 * @param navigate
 */
export async function handlePythonDataReceived(
  pyResponseObject,
  dispatch,
  navigate
) {
  /* This will cause issues because we're sending another command back.
                                                                                                                                                                                                    pyPrintFromJS(
                                                                                                                                                                                                      `(ReactApp) Received cmd from python: ${JSON.stringify(pyResponseObject)}`
                                                                                                                                                                                                    );
                                                                                                                                                                                                     */

  const cmd = pyResponseObject.cmd;
  const data = pyResponseObject.data;

  // Python settles a failed command with its DID_ plus a top-level `error`.
  // A fire-and-forget command (no commandId) has no promise and no sender-side
  // catch, so nothing else would ever clear the chat/global spinners or show
  // the message: clear them here and surface it.
  // Promise-tracked commands (commandId present) are deliberately left alone:
  // initPythonBridge rejects their promise and their sender maps the error —
  // the TTS flows reject with sentinels (TTS_NOT_INSTALLED, TTS_PACK_MISSING,
  // TTS_UNSUPPORTED) that open the setup modal, and must not get a generic
  // toast on top. The `DID_` scope also keeps the localEngineStartFailed /
  // ttsError pushes (which carry a top-level `error` too) out of this branch.
  if (
    pyResponseObject.error &&
    String(cmd).startsWith("DID_") &&
    !pyResponseObject.commandId
  ) {
    stopAllLoaders(dispatch);
    errorToast("Error", String(pyResponseObject.error).slice(0, 300));
    return;
  }

  switch (cmd) {
    case "explainSelectedText":
      handleExplainSelectedText(pyResponseObject.text, dispatch, navigate);
      break;
    case "talkSelectedText":
      handleTalkSelectedText(pyResponseObject.text, dispatch, navigate);
      break;
    case "playTtsAudio":
      playTtsUrl(pyResponseObject.url, pyResponseObject.text || "");
      break;
    case "ttsSetupRequired":
      // Python may request a specific flow (e.g. 'add_ja' for a detected
      // Japanese text whose pack is not installed).
      openSetupModal(pyResponseObject.mode || "default");
      break;
    case "ttsError":
      errorToast("Voice Error", String(pyResponseObject.message || "").slice(0, 300));
      break;
    case "localEngineSetupRequired":
      openLocalEngineModal("default");
      if (pyResponseObject.autoStart) {
        // Drift self-heals on boot: the modal opens and the (cache-warm)
        // repair starts immediately. An absent engine waits for a click.
        pyLocalEngineInstall();
      }
      break;
    case "localEngineUninstallPrompt":
      openLocalEngineModal("uninstall");
      break;
    case "localEngineStartFailed":
      store.dispatch(setLocalEngineStartError(pyResponseObject.error));
      errorToast(
        "Local Engine Error",
        String(pyResponseObject.error || "").slice(0, 300)
      );
      // Settings banner + Repair button is the recovery path: no generic
      // ERROR toast and no navigation.
      refreshLocalEngineStatus();
      break;
    case IC.TTS_INSTALL_PROGRESS:
      store.dispatch(setTtsInstallEvent(data));
      break;
    case IC.TTS_INSTALL_DONE:
      store.dispatch(setTtsInstallDone(data));
      if (data && data.ok) {
        // Only refresh status (Settings buttons branch on installed state).
        // The action that opened the modal is deliberately NOT replayed —
        // the user re-clicks speak / generate audio themselves.
        refreshTtsStatus();
      }
      break;
    case IC.LOCAL_ENGINE_INSTALL_PROGRESS:
      store.dispatch(setLocalEngineInstallEvent(data));
      break;
    case IC.LOCAL_ENGINE_INSTALL_DONE:
      store.dispatch(setLocalEngineInstallDone(data));
      if (data && data.ok) {
        // The python handler restarts the engine after a successful install;
        // refreshing status lets the Settings UI leave the install state.
        refreshLocalEngineStatus();
      }
      break;
    case IC.CARD_AUDIO_RESULT:
      handleCardAudioResult(data);
      break;
    case IC.DID_EXPLAIN_TOPIC:
      handleDidExplainTopic(
        pyResponseObject.data.explanation,
        dispatch,
        navigate
      );
      break;
    case IC.DID_ADD_CARDS:
      //successToast("Cards Added", "Your cards have been added to Anki.");
      break;
    case IC.DID_ASK_CONVERSATION_NO_DOCUMENTS: {
      // Locals per case, never assignments to a name some sibling case
      // declares with `let`: those resolve to that sibling's binding, and
      // touching it throws before that case ever ran. That TDZ is exactly how
      // a talk reply used to throw here and leave the chat spinner spinning.
      const model = store.getState().appSettings.ai.llmModel;
      const temperature = store.getState().appSettings.ai.temperature;
      addAIMessageToStore(data.response, [], model, temperature, dispatch);
      dispatch(setChatLoading(false));
      break;
    }
    case IC.DID_ASK_CONVERSATION_DOCUMENTS: {
      const sourceDocuments = JSON.parse(data.source_documents);
      const sourceSnippets = [];
      for (const doc of sourceDocuments) {
        sourceSnippets.push(doc.page_content);
      }
      const model = store.getState().appSettings.ai.llmModel;
      const temperature = store.getState().appSettings.ai.temperature;
      addAIMessageToStore(
        data.response,
        sourceSnippets,
        model,
        temperature,
        dispatch
      );
      dispatch(setChatLoading(false));
      break;
    }
    case IC.DID_ADD_DOCUMENTS:
      // const documentsAdded = data.documents_added;
      // dispatch(addDocumentsToStore(documentsAdded));
      // dispatch(setDocumentsLoading(false));
      // successToast(
      //   "Added Documents",
      //   `${documentsAdded.length} documents added.`
      // );
      break;
    case IC.DID_CLOSE_DOCUMENT_BROWSER_NO_SELECTIONS:
      dispatch(setDocumentsLoading(false));
      break;
    case IC.DID_CLEAR_CONVERSATION:
      // This is just confirmation that the convo has reset (triggered by user on JS side).
      break;
    case IC.DID_LOAD_SETTINGS:
      // Hydrate the store with the data from python layer's settings.json.
      let {
        aiLanguage,
        deleteCardsAfterAdding,
        currentVersion,
        customPromptChat,
        customPromptMakeCards,
        customPromptTopicExplanation,
        colorMode,
        documents_saved,
        llmModel,
        temperature,
        user_mode,
        user,
        devMode,
        tempCards,
        recoveredCards,
        showBootReminderDialog,
        showCardBottomHint,
        canToggleDevMode,
        openaiBaseUrl,
        openaiExtraHeaders,
        openaiSessionId,
        openaiModels,
        hasOpenaiApiKey,
      } = data;

      // Python only sets canToggleDevMode in dev checkouts; packaged
      // installs leave window.developerMode false so the SettingsScreen
      // Developer Mode switch stays locked ("No Access").
      window.developerMode = canToggleDevMode === true;

      if (aiLanguage) {
        dispatch(setLanguage(aiLanguage));
      }
      if (
        deleteCardsAfterAdding !== undefined ||
        deleteCardsAfterAdding !== null
      ) {
        dispatch(setDeleteCardsAfterAdding(deleteCardsAfterAdding));
      }
      if (currentVersion) {
        dispatch(setCurrentVersion(currentVersion));
      }
      if (customPromptChat !== undefined) {
        dispatch(setCustomPromptChat(customPromptChat));
      }
      if (customPromptMakeCards !== undefined) {
        dispatch(setCustomPromptMakeCards(customPromptMakeCards));
      }
      if (customPromptTopicExplanation !== undefined) {
        dispatch(setCustomPromptTopicExplanation(customPromptTopicExplanation));
      }
      if (documents_saved) {
        dispatch(setDocuments(documents_saved));
      }
      if (llmModel) {
        dispatch(setLLMModel(llmModel));
      }
      if (temperature) {
        dispatch(setTemperature(temperature));
      }

      // OpenAI / OpenAI-compatible endpoint (LOCAL mode). Python only ever
      // sends whether a key exists, never the secret itself.
      if (openaiBaseUrl !== undefined) {
        dispatch(setOpenAIBaseUrl(openaiBaseUrl));
      }
      if (openaiExtraHeaders && typeof openaiExtraHeaders === "object") {
        dispatch(setOpenAIExtraHeaders(openaiExtraHeaders));
      }
      if (typeof openaiSessionId === "string") {
        dispatch(setOpenAISessionId(openaiSessionId));
      }
      if (Array.isArray(openaiModels)) {
        dispatch(setOpenAIModels(openaiModels));
      }
      dispatch(setHasOpenaiApiKey(hasOpenaiApiKey === true));

      if (user_mode) {
        dispatch(setUserMode(user_mode));
      }
      if (colorMode) {
        dispatch(setColorMode(colorMode));
      }
      if (devMode !== null && devMode !== undefined) {
        dispatch(setDevMode(devMode));
        setupServerAPI();
      }
      if (tempCards) {
        if (typeof tempCards === "string") {
          tempCards = JSON.parse(tempCards);
        }
        dispatch(setCards(tempCards));
      }

      // A pending backup means the previous Add-to-Anki never finished
      // cleanly. Restore only when the in-memory list is empty; otherwise the
      // user's list already holds the cards, so nothing was lost. Always
      // consume the backup so it can never be replayed against a later,
      // deliberate clear.
      if (
        recoveredCards &&
        Array.isArray(recoveredCards.cards) &&
        recoveredCards.cards.length > 0
      ) {
        if (store.getState().cards.value.length === 0) {
          dispatch(setCards(recoveredCards.cards));
          await pyEditSetting("tempCards", recoveredCards.cards);
          infoToast(
            "Cards Recovered",
            `${recoveredCards.cards.length} card${
              recoveredCards.cards.length === 1 ? "" : "s"
            } from an interrupted Add-to-Anki were restored. Review them before adding again.`,
            10000
          );
        }
        await pyClearCardsBackup();
      }
      if (
        showBootReminderDialog !== null ||
        showBootReminderDialog !== undefined
      ) {
        dispatch(setShowBootReminderDialog(showBootReminderDialog));
      }
      if (showCardBottomHint !== null || showCardBottomHint !== undefined) {
        dispatch(setShowCardBottomHint(showCardBottomHint));
      }

      // AnkiBrain Voice: hydrate the tts slice from settings.json (python
      // merges new keys with defaults before sending, so every key exists).
      const ttsPatch = {};
      for (const k of [
        "ttsVoice",
        "ttsSpeed",
        "ttsAutoDetect",
        "ttsCardAudioMode",
      ]) {
        if (data[k] !== undefined) ttsPatch[k] = data[k];
      }
      store.dispatch(setTtsSettings(ttsPatch));

      if (typeof user === "string") {
        user = JSON.parse(user);
      }

      // We have an access token, refresh user from server.
      // If this is not the case, don't set user in the store.
      // checkedAuth must flip even if the round trip throws, otherwise the
      // server-mode login gate would sit forever on "Checking your session...".
      try {
        let loggedIn = false;
        if (user && user.accessToken) {
          let res = await getUser(user.accessToken);
          if (res.status === "success") {
            await setUser(res.data.user);
            loggedIn = true;
          }
        }
        if (!loggedIn) {
          if (import.meta.env.VITE_APP_ENV !== "STANDALONE") {
            await logout(); // sets user to null in the store and in python layer
          }
        }
      } finally {
        dispatch(setCheckedAuth(true));
      }

      break;
    case IC.DID_FINISH_STARTUP:
      dispatch(setBoolGlobalLoadingIndicator(false));

      // Set app booted flag in the store so react components can listen to it easily.
      dispatch(setAppDidBoot(true));

      // AnkiBrain Voice: fetch engine status (cheap file checks on the python
      // side; Settings + the speak-error flow both branch on it).
      refreshTtsStatus();

      break;
    case IC.SET_WEBAPP_LOADING:
      dispatch(setBoolGlobalLoadingIndicator(data.value));
      break;
    case IC.SET_WEBAPP_LOADING_TEXT:
      dispatch(setLoadingText(data.text));
      break;
    case IC.STOP_LOADERS:
      stopAllLoaders(dispatch);
      break;
    case IC.ERROR:
      errorToast("Error", data.message);

      // Got an error back so just stop all spinners for now.
      stopAllLoaders(dispatch);

      // Also necessary to unlock python commands.
      dispatch(setPyCommandLock(false));
  }

  // Update costs.
  if (data && data.total_cost) {
    dispatch(setSessionCost(data.total_cost));
  }

  if (data && data.lifetime_cost) {
    dispatch(setLifetimeCost(data.lifetime_cost));
  }
}

export function initPythonBridge(window, dispatch, navigate) {
  window.receiveFromPython = (pyResponseObject) => {
    // The switchboard is async and is not awaited here, so anything it throws
    // would be an unhandled rejection that leaves the spinners it set on screen
    // forever (the talk send spinner hung exactly that way). Settle it instead:
    // clear the loaders and say what broke.
    handlePythonDataReceived(pyResponseObject, dispatch, navigate).catch((e) => {
      stopAllLoaders(dispatch);
      errorToast("Error", String(e && e.message ? e.message : e).slice(0, 300));
    });

    // We got a response to an action, remove lock.
    if (pyResponseObject.cmd.startsWith("DID_")) {
      store.dispatch(setPyCommandLock(false));

      try {
        // Check if there is an async resolver for this command.
        if (pyResponseObject.commandId) {
          const { resolve, reject } = commandResolvers.get(
            pyResponseObject.commandId
          );
          if (resolve && reject) {
            // Check if python response contains an error.
            if (pyResponseObject.error) {
              reject(pyResponseObject.error);
            } else {
              let data = pyResponseObject.data;
              if (!pyResponseObject.data) {
                data = {};
              }

              if (typeof data === "string") {
                data = JSON.parse(data);
              }
              resolve(data);
            }

            commandResolvers.delete(pyResponseObject.commandId);
          }
        }
      } catch (err) {
        errorToast("Error in promise resolution", err);
      }
    }
  };
}

function _sendToPython(data) {
  // This console.log IS the wire, not a debug trace: WebEnginePage's
  // javaScriptConsoleMessage intercepts the DATA_FROM_REACT prefix and emits
  // the rest of the message to ReactBridge. Never mask or transform a field
  // here - the payload has to arrive verbatim (replacing apiKey with a
  // redaction token once made python save that literal text as the API key).
  // Anki-side stdout is redacted in ReactBridge instead.
  console.log(`DATA_FROM_REACT: ${JSON.stringify(data)}`);
}

export function sendPythonCommand(cmd, params = {}) {
  if (import.meta.env.VITE_APP_ENV === "STANDALONE") {
    return true;
  }

  const pyCommandLock = store.getState().pyCommandLock.value;
  if (pyCommandLock) {
    errorToast(
      "Error",
      "Please wait for the current action to complete executing. "
    );

    return;
  }

  store.dispatch(setPyCommandLock(true));
  const consolidated = { cmd, ...params };
  /*pyPrintFromJS(
                                                                                                                                                                                                            `(React App) Sending command to python: ${JSON.stringify(consolidated)}`
                                                                                                                                                                                                          );*/

  _sendToPython(consolidated);
}

let commandResolvers = new Map();
let commandIdCounter = 0;

export async function asendPythonCommand(cmd, params = {}) {
  if (import.meta.env.VITE_APP_ENV === "STANDALONE") {
    return true;
  }

  return new Promise((resolve, reject) => {
    const commandId = ++commandIdCounter;
    _sendToPython({ cmd, commandId, ...params });
    commandResolvers.set(commandId, { resolve, reject });
  });
}
