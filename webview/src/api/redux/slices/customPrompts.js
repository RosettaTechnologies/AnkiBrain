import { createSlice } from "@reduxjs/toolkit";

export const customPrompts = createSlice({
  name: "customPrompts",
  initialState: {
    value: {
      chat: "",
      makeCards: "",
      topicExplanation: "",
    },
  },
  reducers: {
    setCustomPromptChat: (state, action) => {
      state.value.chat = action.payload;
    },
    setCustomPromptMakeCards: (state, action) => {
      state.value.makeCards = action.payload;
    },
    setCustomPromptTopicExplanation: (state, action) => {
      state.value.topicExplanation = action.payload;
    },
  },
});

export const {
  setCustomPromptChat,
  setCustomPromptMakeCards,
  setCustomPromptTopicExplanation,
} = customPrompts.actions;
