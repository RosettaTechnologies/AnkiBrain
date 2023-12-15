import { createSlice } from "@reduxjs/toolkit";

export const documentsLoadingSlice = createSlice({
  name: "documentsLoading",
  initialState: { value: false },
  reducers: {
    setDocumentsLoading: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setDocumentsLoading } = documentsLoadingSlice.actions;
