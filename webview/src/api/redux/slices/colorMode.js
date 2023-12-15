import { createSlice } from "@reduxjs/toolkit";

export const colorMode = createSlice({
  name: "colorMode",
  initialState: { value: "dark" },
  reducers: {
    setColorMode: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setColorMode } = colorMode.actions;
