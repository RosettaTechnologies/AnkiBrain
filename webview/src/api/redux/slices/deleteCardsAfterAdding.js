import { createSlice } from "@reduxjs/toolkit";

export const deleteCardsAfterAdding = createSlice({
  name: "deleteCardsAfterAdding",
  initialState: { value: true },
  reducers: {
    setDeleteCardsAfterAdding: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setDeleteCardsAfterAdding } = deleteCardsAfterAdding.actions;
