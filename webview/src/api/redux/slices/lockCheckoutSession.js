import { createSlice } from "@reduxjs/toolkit";

export const lockCheckoutSession = createSlice({
  name: "lockCheckoutSession",
  initialState: { value: false },
  reducers: {
    setLockCheckoutSession: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setLockCheckoutSession } = lockCheckoutSession.actions;
