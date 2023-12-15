import { createSlice } from "@reduxjs/toolkit";

export const failedCards = createSlice({
  name: "failedCards",
  initialState: { value: [] },
  reducers: {
    addFailedCards: (state, action) => {
      state.value.push(...action.payload);
    },
    clearFailedCards: (state) => {
      state.value = [];
    },
  },
});

export const { addFailedCards, clearFailedCards } = failedCards.actions;
