import { createSlice } from "@reduxjs/toolkit";

export const appSettings = createSlice({
  name: "appSettings",
  initialState: {
    ai: {
      llmModel: "gpt-5.6-luna",
      temperature: 0,
      // OpenAI / OpenAI-compatible endpoint (LOCAL mode). The API key itself
      // never reaches the webview; hasOpenaiApiKey is the only key info.
      openaiBaseUrl: "",
      openaiExtraHeaders: {},
      // Sent automatically as x-opencode-session; shown read-only in Settings.
      openaiSessionId: "",
      openaiModels: [],
      hasOpenaiApiKey: false,
    },
  },
  reducers: {
    setLLMModel: (state, action) => {
      state.ai.llmModel = action.payload;
    },
    setTemperature: (state, action) => {
      state.ai.temperature = action.payload;
    },
    setOpenAIBaseUrl: (state, action) => {
      state.ai.openaiBaseUrl = action.payload;
    },
    setOpenAIExtraHeaders: (state, action) => {
      state.ai.openaiExtraHeaders = action.payload;
    },
    setOpenAISessionId: (state, action) => {
      state.ai.openaiSessionId = action.payload;
    },
    setOpenAIModels: (state, action) => {
      state.ai.openaiModels = action.payload;
    },
    setHasOpenaiApiKey: (state, action) => {
      state.ai.hasOpenaiApiKey = action.payload;
    },
  },
});

export const {
  setLLMModel,
  setTemperature,
  setOpenAIBaseUrl,
  setOpenAIExtraHeaders,
  setOpenAISessionId,
  setOpenAIModels,
  setHasOpenaiApiKey,
} = appSettings.actions;
