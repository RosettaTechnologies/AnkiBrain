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
      // USD per 1M tokens. 0 = unset: the cost tracker uses the cost the
      // endpoint reports per response instead.
      openaiInputCostPer1M: 0,
      openaiOutputCostPer1M: 0,
      // Result of the last successful Test connection, hydrated from
      // settings.json at boot ({ok, baseUrl, urlMessage, key:{status,message}})
      // so the verification survives a restart; null when nothing verified.
      openaiTestResult: null,
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
    setOpenAIInputCostPer1M: (state, action) => {
      state.ai.openaiInputCostPer1M = action.payload;
    },
    setOpenAIOutputCostPer1M: (state, action) => {
      state.ai.openaiOutputCostPer1M = action.payload;
    },
    setOpenAITestResult: (state, action) => {
      state.ai.openaiTestResult = action.payload;
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
  setOpenAIInputCostPer1M,
  setOpenAIOutputCostPer1M,
  setOpenAITestResult,
  setHasOpenaiApiKey,
} = appSettings.actions;
