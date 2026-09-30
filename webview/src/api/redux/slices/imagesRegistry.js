import { createSlice } from "@reduxjs/toolkit";

/*
 * Registry of document images extracted during split, keyed by id
 * (a media_tmp relative path). Full bytes live on disk inside Anki; the
 * webview previews render via the local file URL. Generated cards only ever
 * reference images by id.
 */
export const imagesRegistry = createSlice({
  name: "imagesRegistry",
  initialState: { value: {} },
  reducers: {
    addImages: (state, action) => {
      // action.payload: array of {id, url, mediaType, anchorChunk}
      for (const image of action.payload) {
        if (image && image.id) {
          state.value[image.id] = image;
        }
      }
    },
    clearImages: (state) => {
      state.value = {};
    },
  },
});

export const { addImages, clearImages } = imagesRegistry.actions;
