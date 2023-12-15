import { createSlice } from "@reduxjs/toolkit";

export const topicExplanationSlice = createSlice({
  name: "topicExplanation",
  initialState: { value: "", loading: false },
  reducers: {
    setTopicExplanation: (state, action) => {
      state.value = action.payload;
    },
    resetTopicExplanation: (state) => {
      state.value = "";
    },
    setTopicExplanationLoading: (state, action) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setTopicExplanation,
  resetTopicExplanation,
  setTopicExplanationLoading,
} = topicExplanationSlice.actions;
