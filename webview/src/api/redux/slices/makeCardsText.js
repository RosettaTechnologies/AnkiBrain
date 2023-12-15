import { createSlice } from "@reduxjs/toolkit";

export const makeCardsText = createSlice({
  name: "makeCardsText",
  initialState: { value: "", loading: false },
  reducers: {
    setMakeCardsText: (state, action) => {
      state.value = action.payload;
    },
    setMakeCardsLoading: (state, action) => {
      state.loading = action.payload;
    },
  },
});

export const { setMakeCardsText, setMakeCardsLoading } = makeCardsText.actions;
