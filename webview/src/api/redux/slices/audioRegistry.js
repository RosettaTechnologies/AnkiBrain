import { createSlice } from "@reduxjs/toolkit";

/*
 * Registry of synthesized card-audio clips, keyed by media_tmp-relative id
 * ("tts/kokoro-<voice>-<hash>.wav"). Mirrors imagesRegistry: bytes live on
 * disk inside Anki, cards only reference ids, and the webview previews play
 * via the local file url. Unlike images, entries are never removed on card
 * delete — files are content-hashed, so regenerating the same text is an
 * instant engine-cache hit and the url stays valid.
 */
export const audioRegistry = createSlice({
  name: "audioRegistry",
  initialState: { value: {} },
  reducers: {
    addAudioEntries: (state, action) => {
      // action.payload: array of {id, url, mediaType}
      for (const entry of action.payload) {
        if (entry && entry.id) {
          state.value[entry.id] = entry;
        }
      }
    },
    clearAudio: (state, action) => {
      state.value = {};
    },
  },
});

export const { addAudioEntries, clearAudio } = audioRegistry.actions;
