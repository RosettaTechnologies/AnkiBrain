import { createSlice } from "@reduxjs/toolkit";

// Tracks whether the DID_LOAD_SETTINGS session-restore round trip
// (validating a persisted accessToken against the server) has finished.
// The login gate uses this to show a "checking session" state instead of
// flashing the login form while a saved session is still being verified.
export const checkedAuth = createSlice({
  name: "checkedAuth",
  initialState: { value: false },
  reducers: {
    setCheckedAuth: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setCheckedAuth } = checkedAuth.actions;
