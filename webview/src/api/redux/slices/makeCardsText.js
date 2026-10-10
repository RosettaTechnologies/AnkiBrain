import { createSlice } from "@reduxjs/toolkit";

export const makeCardsText = createSlice({
  name: "makeCardsText",
  initialState: { value: "", loading: false, stagedImageIds: [] },
  reducers: {
    setMakeCardsText: (state, action) => {
      state.value = action.payload;
    },
    setMakeCardsLoading: (state, action) => {
      state.loading = action.payload;
    },
    // Images pasted into the From Text box. Staged here (not component state)
    // so they survive navigation the same way `value` does; cleared once the
    // next text run consumes them or their images are removed.
    addStagedImageId: (state, action) => {
      if (!state.stagedImageIds.includes(action.payload)) {
        state.stagedImageIds.push(action.payload);
      }
    },
    removeStagedImageId: (state, action) => {
      state.stagedImageIds = state.stagedImageIds.filter(
        (id) => id !== action.payload
      );
    },
    clearStagedImages: (state) => {
      state.stagedImageIds = [];
    },
  },
});

export const {
  setMakeCardsText,
  setMakeCardsLoading,
  addStagedImageId,
  removeStagedImageId,
  clearStagedImages,
} = makeCardsText.actions;
