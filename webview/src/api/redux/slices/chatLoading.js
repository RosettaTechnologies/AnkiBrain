import { createSlice } from "@reduxjs/toolkit";

export const chatLoadingSlice = createSlice({
  name: "chatLoading",
  initialState: { value: false },
  reducers: {
    setChatLoading: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setChatLoading } = chatLoadingSlice.actions;
