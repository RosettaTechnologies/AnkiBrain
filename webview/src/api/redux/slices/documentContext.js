import { createSlice } from "@reduxjs/toolkit";

/*
 * Describes the most recently processed document on the From Documents tab.
 * The extracted image descriptors themselves live in imagesRegistry keyed by
 * id; ids are "<run-id>/<filename>", so runId lets the UI isolate "images
 * from the document I just processed" from leftovers of earlier runs.
 */
export const documentContextSlice = createSlice({
  name: "documentContext",
  initialState: {
    value: { docName: "", runId: "", chunksCount: 0, imagesCount: 0 },
  },
  reducers: {
    setDocumentContext: (state, action) => {
      state.value = { ...state.value, ...action.payload };
    },
    clearDocumentContext: (state) => {
      state.value = { docName: "", runId: "", chunksCount: 0, imagesCount: 0 };
    },
  },
});

export const { setDocumentContext, clearDocumentContext } =
  documentContextSlice.actions;
