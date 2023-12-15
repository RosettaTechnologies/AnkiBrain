import { createSlice } from "@reduxjs/toolkit";

export const showBootReminderDialog = createSlice({
  name: "showBootReminderDialog",
  initialState: { value: true },
  reducers: {
    setShowBootReminderDialog: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setShowBootReminderDialog } = showBootReminderDialog.actions;
