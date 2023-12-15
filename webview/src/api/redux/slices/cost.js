import { createSlice } from "@reduxjs/toolkit";

export const cost = createSlice({
  name: "cost",
  initialState: { session: 0, lifetime: 0 },
  reducers: {
    setSessionCost: (state, action) => {
      state.session = action.payload;
    },
    setLifetimeCost: (state, action) => {
      state.lifetime = action.payload;
    },
  },
});

export const { setSessionCost, setLifetimeCost } = cost.actions;
