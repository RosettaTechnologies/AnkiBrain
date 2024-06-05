import { createSlice } from "@reduxjs/toolkit";

export const appSettings = createSlice({
  name: "appSettings",
  initialState: {
    ai: {
      llmProvider: "openai",
      llmModel: "gpt-3.5-turbo",
      temperature: 0,
    },
  },
  reducers: {
    setLLMProvider: (state, action) => {
      state.ai.llmProvider = action.payload
    },
    setLLMModel: (state, action) => {
      state.ai.llmModel = action.payload;
    },
    setTemperature: (state, action) => {
      state.ai.temperature = action.payload;
    },
  },
});

export const { setLLMProvider, setLLMModel, setTemperature } = appSettings.actions;
