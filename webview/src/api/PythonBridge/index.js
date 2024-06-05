import { handleExplainSelectedText } from "./receivers/handleExplainSelectedText";
import { handleDidExplainTopic } from "./receivers/handleDidExplainTopic";
import { handleTalkSelectedText } from "./receivers/handleTalkSelectedText";
import { addAIMessageToStore } from "../chat";
import { InterprocessCommand as IC } from "./InterprocessCommand";
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
import { setLLMModel, setLLMProvider, setTemperature } from "../redux/slices/appSettings";
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
import { setAutomaticallyAddCards } from "../redux/slices/automaticallyAddCards";
import { setDeleteCardsAfterAdding } from "../redux/slices/deleteCardsAfterAdding";
import { setShowBootReminderDialog } from "../redux/slices/showBootReminderDialog";
import { pyEditSetting } from "./senders/pyEditSetting";
import { setAppDidBoot } from "../redux/slices/appDidBoot";
import {
  setCustomPromptChat,
  setCustomPromptMakeCards,
  setCustomPromptTopicExplanation,
} from "../redux/slices/customPrompts";
import { setOllamaModels } from "../redux/slices/ollama"

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

  switch (cmd) {
    case "explainSelectedText":
      handleExplainSelectedText(pyResponseObject.text, dispatch, navigate);
      break;
    case "talkSelectedText":
      handleTalkSelectedText(pyResponseObject.text, dispatch, navigate);
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
      let model = store.getState().appSettings.ai.llmModel;
      let temperature = store.getState().appSettings.ai.temperature;
      addAIMessageToStore(data.response, [], model, temperature, dispatch);
      dispatch(setChatLoading(false));
      break; 
    }
    case IC.DID_ASK_CONVERSATION_DOCUMENTS: {
      let sourceDocuments = JSON.parse(data.source_documents);
      let sourceSnippets = [];
      for (let doc of sourceDocuments) {
        sourceSnippets.push(doc.page_content);
      }
      let model = store.getState().appSettings.ai.llmModel;
      let temperature = store.getState().appSettings.ai.temperature;
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
    case IC.DID_LOAD_OLLAMA_MODELS:
      // Hydrate store with available ollama models
      let {
        ollamaModels
      } = data;

      if (ollamaModels) {
        dispatch(setOllamaModels(ollamaModels))
      }
      break;
    case IC.DID_LOAD_SETTINGS:
      // Hydrate the store with the data from python layer's settings.json.
      let {
        aiLanguage,
        automaticallyAddCards,
        deleteCardsAfterAdding,
        currentVersion,
        customPromptChat,
        customPromptMakeCards,
        customPromptTopicExplanation,
        colorMode,
        documents_saved,
        llmProvider,
        llmModel,
        temperature,
        user_mode,
        user,
        devMode,
        tempCards,
        showBootReminderDialog,
        showCardBottomHint,
      } = data;

      if (aiLanguage) {
        dispatch(setLanguage(aiLanguage));
      }
      if (
        automaticallyAddCards !== undefined ||
        automaticallyAddCards !== null
      ) {
        dispatch(setAutomaticallyAddCards(automaticallyAddCards));
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
      if (llmProvider) {
        dispatch(setLLMProvider(llmProvider))
      }
      if (llmModel) {
        dispatch(setLLMModel(llmModel));
      }
      if (temperature) {
        dispatch(setTemperature(temperature));
      }

      if (user_mode) {
        dispatch(setUserMode(user_mode));
      }
      if (colorMode) {
        dispatch(setColorMode(colorMode));
      }
      if (devMode !== null || devMode !== undefined) {
        dispatch(setDevMode(devMode));
        setupServerAPI();
      }
      if (tempCards) {
        if (typeof tempCards === "string") {
          tempCards = JSON.parse(tempCards);
        }
        dispatch(setCards(tempCards));
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
      if (typeof user === "string") {
        user = JSON.parse(user);
      }

      // We have an access token, refresh user from server.
      // If this is not the case, don't set user in the store.
      let loggedIn = false;
      if (user && user.accessToken) {
        let res = await getUser(user.accessToken);
        if (res.status === "success") {
          await setUser(res.data.user);
          loggedIn = true;
        }
      }
      if (!loggedIn) {
        if (process.env.REACT_APP_ENV !== "STANDALONE") {
          await logout(); // sets user to null in the store and in python layer
        }
      }

      break;
    case IC.DID_FINISH_STARTUP:
      dispatch(setBoolGlobalLoadingIndicator(false));

      // Set app booted flag in the store so react components can listen to it easily.
      dispatch(setAppDidBoot(true));

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
    handlePythonDataReceived(pyResponseObject, dispatch, navigate);

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
  console.log(`DATA_FROM_REACT: ${JSON.stringify(data)}`);
}

export function sendPythonCommand(cmd, params = {}) {
  if (process.env.REACT_APP_ENV === "STANDALONE") {
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
  if (process.env.REACT_APP_ENV === "STANDALONE") {
    return true;
  }

  return new Promise((resolve, reject) => {
    const commandId = ++commandIdCounter;
    _sendToPython({ cmd, commandId, ...params });
    commandResolvers.set(commandId, { resolve, reject });
  });
}
