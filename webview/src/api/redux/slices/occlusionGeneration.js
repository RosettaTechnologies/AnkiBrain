import { createSlice } from "@reduxjs/toolkit";

/*
 * Bookkeeping for in-flight AI mask generation on image-occlusion cards.
 * Mirrors cardAudio (see slices/cardAudio.js): jobs are addressed by card
 * uid, so a spinner, a cancel, or a late vision result always targets
 * exactly one card even if the review list was edited meanwhile.
 *
 * The engine side lives in api/occlusionGeneration.js (a sequential
 * webview-side queue — the ChatAI pipe handles one request at a time).
 */
export const occlusionGenerationSlice = createSlice({
  name: "occlusionGeneration",
  initialState: {
    // { [uid]: true } — drives the per-card spinner AND the Add-to-Anki gate.
    generating: {},
    // { [uid]: message } — failed cards, surfaced as a retry.
    errors: {},
    // uids whose results must be discarded: a cancel stops the queue before
    // the item starts, but the vision call already in flight still finishes
    // and would otherwise apply its shapes to a card the user moved on from.
    cancelled: {},
  },
  reducers: {
    occlusionJobStarted(state, action) {
      // action.payload: array of uids
      for (const uid of action.payload) {
        state.generating[uid] = true;
        delete state.errors[uid];
        delete state.cancelled[uid];
      }
    },
    occlusionJobSettled(state, action) {
      // The spinner comes down whether the masks landed, failed, or were
      // discarded — this only clears the in-flight mark.
      delete state.generating[action.payload.uid];
    },
    occlusionJobFailed(state, action) {
      const { uid, message } = action.payload;
      state.errors[uid] = message;
    },
    occlusionJobsCancelled(state, action) {
      // action.payload: { uids?: [...], all?: bool }
      const { uids = [], all = false } = action.payload;
      const targets = all ? Object.keys(state.generating) : uids.map(String);
      for (const uid of targets) {
        state.cancelled[uid] = true;
        // Spinners for cancelled jobs come down immediately — a cancelled
        // job must never gate Add-to-Anki. Other jobs in the batch keep
        // spinning; their results still apply.
        delete state.generating[uid];
      }
    },
    consumeOcclusionCancelled(state, action) {
      // Clear a cancel mark once its late result has been discarded (or
      // never arrives), so a later retry for the same card applies again.
      delete state.cancelled[action.payload.uid];
    },
    occlusionJobsCleared(state) {
      // Recovery path: bridge error/engine restart killed the queue
      // mid-flight, so marks can't be trusted anymore.
      state.generating = {};
    },
  },
});

export const {
  occlusionJobStarted,
  occlusionJobSettled,
  occlusionJobFailed,
  occlusionJobsCancelled,
  consumeOcclusionCancelled,
  occlusionJobsCleared,
} = occlusionGenerationSlice.actions;

export function countOcclusionGenerating(generating) {
  return Object.keys(generating || {}).length;
}
