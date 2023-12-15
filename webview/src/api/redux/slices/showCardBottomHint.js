import { createSlice } from "@reduxjs/toolkit";

export const showCardBottomHint = createSlice({
  name: "showCardBottomHint",
  initialState: { value: true },
  reducers: {
    setShowCardBottomHint: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setShowCardBottomHint } = showCardBottomHint.actions;
