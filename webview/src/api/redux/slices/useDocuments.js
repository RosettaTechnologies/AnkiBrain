import { createSlice } from "@reduxjs/toolkit";

export const useDocuments = createSlice({
  name: "useDocuments",
  initialState: { value: false },
  reducers: {
    setUseDocuments: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setUseDocuments } = useDocuments.actions;
