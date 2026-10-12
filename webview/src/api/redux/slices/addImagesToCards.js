import { createSlice } from "@reduxjs/toolkit";

export const addImagesToCards = createSlice({
  name: "addImagesToCards",
  initialState: { value: true },
  reducers: {
    setAddImagesToCards: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setAddImagesToCards } = addImagesToCards.actions;
