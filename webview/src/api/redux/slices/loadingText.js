import { createSlice } from "@reduxjs/toolkit";

export const loadingText = createSlice({
  name: "loadingText",
  initialState: { value: "AnkiBrain is loading..." },
  reducers: {
    setLoadingText: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setLoadingText } = loadingText.actions;