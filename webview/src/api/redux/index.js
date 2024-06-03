import { configureStore, createSlice } from "@reduxjs/toolkit";
import { requestedTopicSlice } from "./slices/requestedTopic";
import { topicExplanationSlice } from "./slices/topicExplanation";
import { messagesSlice } from "./slices/messagesSlice";
import { documentsSlice } from "./slices/documentsSlice";
import { bGlobalLoadingIndicatorSlice } from "./slices/bGlobalLoadingIndicator";
import { chatLoadingSlice } from "./slices/chatLoading";
import { documentsLoadingSlice } from "./slices/documentsLoadingSlice";
import { cardsSlice } from "./slices/cards";
import { bShowCardsJsonEditor } from "./slices/bShowCardsJsonEditor";
import { useDocuments } from "./slices/useDocuments";
import { makeCardsSettings } from "./slices/makeCardsSettings";
import { appAlertModal } from "./slices/appAlertModal";
import { pyCommandLock } from "./slices/pyCommandLock";
import { makeCardsText } from "./slices/makeCardsText";
import { currentVersionSlice } from "./slices/currentVersion";
import { cost } from "./slices/cost";
import { appSettings } from "./slices/appSettings";
import { loadingText } from "./slices/loadingText";
import { userMode } from "./slices/userMode";
import { cloneDeep } from "lodash";
import { devMode } from "./slices/devMode";
import { apiBaseUrl } from "./slices/apiBaseUrl";
import { colorMode } from "./slices/colorMode";
import { failedCards } from "./slices/failedCards";
import { languageSlice } from "./slices/language";
import { lockCheckoutSession } from "./slices/lockCheckoutSession";
import { showCardBottomHint } from "./slices/showCardBottomHint";
import { automaticallyAddCards } from "./slices/automaticallyAddCards";
import { deleteCardsAfterAdding } from "./slices/deleteCardsAfterAdding";
import { showBootReminderDialog } from "./slices/showBootReminderDialog";
import { appDidBoot } from "./slices/appDidBoot";
import { customPrompts } from "./slices/customPrompts";
import { ollamaModels } from "./slices/ollama";

const showLoginModalSlice = createSlice({
  name: "showLoginModal",
  initialState: { value: false },
  reducers: {
    setShowLoginModal: (state, action) => {
      state.value = action.payload;
    },
  },
});

const currentChatInputSlice = createSlice({
  name: "currentChatInput",
  initialState: { value: "" },
  reducers: {
    setCurrentChatInput: (state, action) => {
      state.value = action.payload;
    },
  },
});

const userSlice = createSlice({
  name: "user",
  initialState: { value: null },
  reducers: {
    setUser: (state, action) => {
      state.value = action.payload;
    },
    updateUser: (state, action) => {
      let user = cloneDeep(state.value);
      //user = merge(user, action.payload);
      user = { ...user, ...action.payload };
      state.value = user;
    },
    setEmailVerified: (state) => {
      let user = cloneDeep(state.value);
      user.isVerified = true;
      state.value = user;
    },
  },
});

export const { setShowLoginModal } = showLoginModalSlice.actions;

export const { setCurrentChatInput } = currentChatInputSlice.actions;

export const { setUser, updateUser, setEmailVerified } = userSlice.actions;

export const store = configureStore({
  reducer: {
    apiBaseUrl: apiBaseUrl.reducer,
    appAlertModal: appAlertModal.reducer,
    appDidBoot: appDidBoot.reducer,
    appSettings: appSettings.reducer,
    automaticallyAddCards: automaticallyAddCards.reducer,
    bGlobalLoadingIndicator: bGlobalLoadingIndicatorSlice.reducer,
    bShowCardsJsonEditor: bShowCardsJsonEditor.reducer,
    cards: cardsSlice.reducer,
    chatLoading: chatLoadingSlice.reducer,
    colorMode: colorMode.reducer,
    cost: cost.reducer,
    currentChatInput: currentChatInputSlice.reducer,
    currentVersion: currentVersionSlice.reducer,
    customPrompts: customPrompts.reducer,
    deleteCardsAfterAdding: deleteCardsAfterAdding.reducer,
    devMode: devMode.reducer,
    documents: documentsSlice.reducer,
    documentsLoading: documentsLoadingSlice.reducer,
    failedCards: failedCards.reducer,
    language: languageSlice.reducer,
    loadingText: loadingText.reducer,
    lockCheckoutSession: lockCheckoutSession.reducer,
    makeCardsSettings: makeCardsSettings.reducer,
    makeCardsText: makeCardsText.reducer,
    messages: messagesSlice.reducer,
    pyCommandLock: pyCommandLock.reducer,
    requestedTopic: requestedTopicSlice.reducer,
    showBootReminderDialog: showBootReminderDialog.reducer,
    showCardBottomHint: showCardBottomHint.reducer,
    showLoginModal: showLoginModalSlice.reducer,
    topicExplanation: topicExplanationSlice.reducer,
    useDocuments: useDocuments.reducer,
    user: userSlice.reducer,
    userMode: userMode.reducer,
    ollamaModels: ollamaModels.reducer,
  },
});
