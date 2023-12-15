import { createSlice } from "@reduxjs/toolkit";

export const userMode = createSlice({
  name: "userMode",
  initialState: { value: null },
  reducers: {
    setUserMode: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setUserMode } = userMode.actions;