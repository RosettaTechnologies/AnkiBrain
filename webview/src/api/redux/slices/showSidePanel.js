import { createSlice } from "@reduxjs/toolkit";

// Stored preference: true = the side panel is visible at boot. The Settings
// switch and the Anki menu item both present its inverse ("Start AnkiBrain
// minimized"). Show/Hide is transient and never writes this.
export const showSidePanel = createSlice({
  name: "showSidePanel",
  initialState: { value: true },
  reducers: {
    setShowSidePanel: (state, action) => {
      state.value = action.payload;
    },
  },
});

export const { setShowSidePanel } = showSidePanel.actions;
