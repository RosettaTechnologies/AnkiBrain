import { createSlice } from "@reduxjs/toolkit";

export const automaticallyAddCards = createSlice({
  name: "automaticallyAddCards",
  initialState: { value: true },
  reducers: {
    setAutomaticallyAddCards: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setAutomaticallyAddCards } = automaticallyAddCards.actions;
