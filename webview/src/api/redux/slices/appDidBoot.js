import { createSlice } from "@reduxjs/toolkit";

export const appDidBoot = createSlice({
  name: "appDidBoot",
  initialState: { value: false },
  reducers: {
    setAppDidBoot: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setAppDidBoot } = appDidBoot.actions;
