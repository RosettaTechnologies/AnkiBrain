import { createSlice } from "@reduxjs/toolkit";

export const messagesSlice = createSlice({
  name: "messages",
  initialState: { value: [] },
  reducers: {
    addMessage: (state, action) => {
      state.value.push(action.payload);
    },
    clearMessages: (state) => {
      state.value = [];
    },
  },
});

export const { addMessage, clearMessages } = messagesSlice.actions;
