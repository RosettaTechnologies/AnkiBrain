import { createSlice } from "@reduxjs/toolkit";

/*
 * The document currently loaded for review on the From Documents/Images tab
 * (populated by buildStagedDocument). Entries are the reviewable pages/
 * sections; the user excludes and edits them before clicking Make Cards.
 * Session-only: a new pick or an Anki restart starts from the empty value.
 */
const emptyValue = {
  docName: "",
  runId: "",
  looseImageIds: [],
  entries: [],
  images: [],
};

export const stagedDocumentSlice = createSlice({
  name: "stagedDocument",
  initialState: { value: emptyValue },
  reducers: {
    setStagedDocument: (state, action) => {
      state.value = action.payload;
    },
    setEntryIncluded: (state, action) => {
      const { id, included } = action.payload;
      const entry = state.value.entries.find((e) => e.id === id);
      if (entry) {
        entry.included = included;
      }
    },
    setAllEntriesIncluded: (state, action) => {
      for (const entry of state.value.entries) {
        entry.included = action.payload;
      }
    },
    invertEntriesIncluded: (state) => {
      for (const entry of state.value.entries) {
        entry.included = !entry.included;
      }
    },
    updateEntryText: (state, action) => {
      const { id, text } = action.payload;
      const entry = state.value.entries.find((e) => e.id === id);
      if (entry) {
        entry.text = text;
      }
    },
    clearStagedDocument: (state) => {
      state.value = { ...emptyValue };
    },
  },
});

export const {
  setStagedDocument,
  setEntryIncluded,
  setAllEntriesIncluded,
  invertEntriesIncluded,
  updateEntryText,
  clearStagedDocument,
} = stagedDocumentSlice.actions;
