import { createSlice } from "@reduxjs/toolkit";

export const documentsSlice = createSlice({
  name: "documents",
  initialState: { value: [] },
  reducers: {
    setRequestedTopic: (state, action) => {
      state.value = action.payload;
    },
    setDocuments: (state, action) => {
      state.value = action.payload;
    },
    addDocument: (state, action) => {
      state.value.push(action.payload);
    },
    addDocuments: (state, action) => {
      state.value.push(...action.payload);
    },
    deleteAllDocuments: (state) => {
      state.value = [];
    },
  },
});

export const { setDocuments, addDocument, addDocuments, deleteAllDocuments } =
  documentsSlice.actions;
