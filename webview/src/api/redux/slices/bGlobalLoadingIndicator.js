import { createSlice } from "@reduxjs/toolkit";

export const bGlobalLoadingIndicatorSlice = createSlice({
  name: "bGlobalLoadingIndicator",
  initialState: { value: false },
  reducers: {
    setBoolGlobalLoadingIndicator: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setBoolGlobalLoadingIndicator } =
  bGlobalLoadingIndicatorSlice.actions;
