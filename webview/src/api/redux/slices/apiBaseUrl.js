import { createSlice } from "@reduxjs/toolkit";
import { PROD_SERVER_URL } from "../../server-api/networking";

export const apiBaseUrl = createSlice({
  name: "apiBaseUrl",
  initialState: { value: PROD_SERVER_URL },
  reducers: {
    setApiBaseUrl: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setApiBaseUrl } = apiBaseUrl.actions;
