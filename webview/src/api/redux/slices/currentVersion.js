import { createSlice } from "@reduxjs/toolkit";

export const currentVersionSlice = createSlice({
  name: "currentVersion",
  initialState: { value: "0" },
  reducers: {
    setCurrentVersion: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setCurrentVersion } = currentVersionSlice.actions;