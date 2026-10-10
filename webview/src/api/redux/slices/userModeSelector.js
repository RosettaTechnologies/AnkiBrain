import { createSlice } from "@reduxjs/toolkit";

// True while the full-screen mode selector (UserModeScreen) is standing in for
// the app shell. It opens on its own at first launch (no user_mode yet) and on
// request from either in-app gate, which is how a user in the auth gate or the
// engine gate switches modes.
export const userModeSelector = createSlice({
  name: "userModeSelector",
  initialState: { value: false },
  reducers: {
    setUserModeSelectorOpen: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setUserModeSelectorOpen } = userModeSelector.actions;
