import { createSlice } from "@reduxjs/toolkit";

export const bShowCardsJsonEditor = createSlice({
  name: "bShowCardsJsonEditor",
  initialState: { value: false },
  reducers: {
    setBoolShowCardsJsonEditor: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setBoolShowCardsJsonEditor } = bShowCardsJsonEditor.actions;
