import { createSlice } from "@reduxjs/toolkit";

export const languageSlice = createSlice({
  name: "languageSlice",
  initialState: { value: "English" },
  reducers: {
    setLanguage: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setLanguage } = languageSlice.actions;
