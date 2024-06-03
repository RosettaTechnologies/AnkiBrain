import { createSlice } from "@reduxjs/toolkit";

export const ollamaModels = createSlice({
  name: "ollamaModels",
  initialState: { value: [] },
  reducers: {
    setOllamaModels: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setOllamaModels } = ollamaModels.actions;