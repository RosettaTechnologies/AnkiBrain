import { createSlice } from "@reduxjs/toolkit";

/**
 * This bool represents whether a command that was sent to python is pending a response.
 * This is to prevent extra commands from being sent before one was completed.
 * There is an error that occurs if this happens because of the way the modules communicate
 * via the console / stdout.
 * @type {Slice<{value: boolean}, {setPyCommandLock: reducers.setPyCommandLock}, string>}
 */
export const pyCommandLock = createSlice({
  name: "pyCommandLock",
  initialState: { value: false },
  reducers: {
    setPyCommandLock: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setPyCommandLock } = pyCommandLock.actions;
