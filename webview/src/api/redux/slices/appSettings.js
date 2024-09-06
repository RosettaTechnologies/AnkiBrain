import { createSlice } from "@reduxjs/toolkit";

export const appSettings = createSlice({
  name: "appSettings",
  initialState: {
    ai: {
      llmModel: "gpt-4o-mini",
      temperature: 0,
    },
  },
  reducers: {
    setLLMModel: (state, action) => {
      state.ai.llmModel = action.payload;
    },
    setTemperature: (state, action) => {
      state.ai.temperature = action.payload;
    },
  },
});

export const { setLLMModel, setTemperature } = appSettings.actions;
