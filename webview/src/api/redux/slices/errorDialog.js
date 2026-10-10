import { createSlice } from "@reduxjs/toolkit";

// One error on screen at a time; the rest wait in `queue` so a burst (a failed
// network call + the caller's own report) can never clobber a message the user
// has not read yet.
export const errorDialog = createSlice({
  name: "errorDialog",
  initialState: { value: { current: null, queue: [], nextId: 1 } },
  reducers: {
    pushErrorDialog: (state, action) => {
      const { title, message } = action.payload;
      const value = state.value;
      if (
        value.current &&
        value.current.title === title &&
        value.current.message === message
      ) {
        return;
      }
      if (
        value.queue.some((e) => e.title === title && e.message === message)
      ) {
        return;
      }
      const entry = { id: value.nextId, title, message };
      value.nextId += 1;
      if (value.current) {
        value.queue.push(entry);
      } else {
        value.current = entry;
      }
    },
    dismissErrorDialog: (state) => {
      state.value.current = state.value.queue.shift() ?? null;
    },
  },
});

export const { pushErrorDialog, dismissErrorDialog } = errorDialog.actions;
