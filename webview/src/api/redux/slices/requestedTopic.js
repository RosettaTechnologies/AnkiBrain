import { createSlice } from "@reduxjs/toolkit";

export const requestedTopicSlice = createSlice({
  name: "requestedTopic",
  initialState: { value: "" },
  reducers: {
    setRequestedTopic: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setRequestedTopic } = requestedTopicSlice.actions;
