import { createSlice } from "@reduxjs/toolkit";

export const makeCardsSettings = createSlice({
  name: "makeCardsSettings",
  initialState: {
    value: {
      levelOfDetail: "LOW",
      levelOfExpertise: "BEGINNER",
    },
  },
  reducers: {
    setLevelOfDetail: (state, action) => {
      state.value.levelOfDetail = action.payload;
    },
    setLevelOfExpertise: (state, action) => {
      state.value.levelOfExpertise = action.payload;
    },
    setMakeCardsSettings: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setLevelOfDetail, setLevelOfExpertise, setMakeCardsSettings } =
  makeCardsSettings.actions;
