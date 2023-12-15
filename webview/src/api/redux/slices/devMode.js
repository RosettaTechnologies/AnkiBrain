import { createSlice } from "@reduxjs/toolkit";

export const devMode = createSlice({
  name: "devMode",
  initialState: { value: false },
  reducers: {
    setDevMode: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setDevMode } = devMode.actions;
