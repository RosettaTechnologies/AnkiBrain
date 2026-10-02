import { createSlice } from "@reduxjs/toolkit";

/*
 * Bookkeeping for in-flight card-audio synthesis (the engine side lives in
 * ReactBridge._a_generate_card_audio; orchestration in api/cardAudio.js).
 * Jobs are addressed per card-uid + field so a spinner, a cancel, or a late
 * result always target exactly one field of exactly one card.
 */
export const cardAudioSlice = createSlice({
  name: "cardAudio",
  initialState: {
    // { [uid]: { [field]: true } } — drives spinners AND the Add-to-Anki gate
    // (cards cannot be added while any in-process action is unfinished).
    generating: {},
    // { [uid]: { [field]: message } } — failed fields, surfaced as a retry.
    errors: {},
    // "uid:field" keys whose results must be discarded: a cancel stops the
    // queue before the item starts, but one clip already synthesizing still
    // finishes and pushes its result.
    cancelled: {},
  },
  reducers: {
    audioJobStarted(state, action) {
      // action.payload: array of {uid, field, text, isCloze}
      for (const item of action.payload) {
        const { uid, field } = item;
        if (!state.generating[uid]) state.generating[uid] = {};
        state.generating[uid][field] = true;
        if (state.errors[uid]) {
          delete state.errors[uid][field];
          if (Object.keys(state.errors[uid]).length === 0) delete state.errors[uid];
        }
        if (state.cancelled[uid]) {
          delete state.cancelled[uid][field];
          if (Object.keys(state.cancelled[uid]).length === 0) delete state.cancelled[uid];
        }
      }
    },
    audioJobSettled(state, action) {
      // The spinner comes down whether the clip landed, failed, or was
      // discarded — this only clears the in-flight mark.
      const { uid, field } = action.payload;
      if (state.generating[uid]) {
        delete state.generating[uid][field];
        if (Object.keys(state.generating[uid]).length === 0) {
          delete state.generating[uid];
        }
      }
    },
    audioJobFailed(state, action) {
      const { uid, field, message } = action.payload;
      if (!state.errors[uid]) state.errors[uid] = {};
      state.errors[uid][field] = message;
    },
    audioJobsCancelled(state, action) {
      // action.payload: { keys?: ["uid:field"...], all?: bool }
      const { keys = [], all = false } = action.payload;
      const targets = all
        ? Object.entries(state.generating).flatMap(([uid, fields]) =>
            Object.keys(fields).map((field) => `${uid}:${field}`)
          )
        : keys;

      for (const key of targets) {
        const sep = key.indexOf(":");
        const uid = key.slice(0, sep);
        const field = key.slice(sep + 1);
        if (!state.cancelled[uid]) state.cancelled[uid] = {};
        state.cancelled[uid][field] = true;
        // Spinners for cancelled fields come down immediately — a cancelled
        // job must never gate Add-to-Anki. Non-cancelled jobs in the same
        // batch keep spinning; their results still apply.
        if (state.generating[uid]) {
          delete state.generating[uid][field];
          if (Object.keys(state.generating[uid]).length === 0) {
            delete state.generating[uid];
          }
        }
      }
    },
    consumeCancelled(state, action) {
      // Clear a cancel mark once its late result has been discarded (or
      // never arrives), so a later job for the same field applies again.
      const { uid, field } = action.payload;
      if (state.cancelled[uid]) {
        delete state.cancelled[uid][field];
        if (Object.keys(state.cancelled[uid]).length === 0) {
          delete state.cancelled[uid];
        }
      }
    },
    audioJobsCleared(state) {
      // Recovery path: bridge error/engine restart (stopAllLoaders) killed
      // the queue mid-flight, so marks can't be trusted anymore.
      state.generating = {};
    },
  },
});

export const {
  audioJobStarted,
  audioJobSettled,
  audioJobFailed,
  audioJobsCancelled,
  consumeCancelled,
  audioJobsCleared,
} = cardAudioSlice.actions;

export function countGenerating(generating) {
  return Object.values(generating).reduce(
    (n, fields) => n + Object.keys(fields).length,
    0
  );
}
