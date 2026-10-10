import { createSlice } from "@reduxjs/toolkit";

export const localEngineSlice = createSlice({
  name: "localEngine",
  initialState: {
    // Raw payload of DID_LOCAL_ENGINE_STATUS (python
    // local_engine.state.current_status()).
    status: null,
    // Bootstrap state for the setup modal: latest stage event + a per-stage
    // checklist (stage -> "active" | "done" | "error") the modal renders as a
    // static to-do/done list. Terminal result lives in `done`.
    install: { active: false, event: null, stages: {}, done: null },
    // Local Engine Setup modal (install/repair/uninstall/reset UI).
    setupModalOpen: false,
    // Which flow the modal renders: "default" (install/repair) or one of the
    // destructive confirm screens "uninstall" / "reset".
    setupModalMode: "default",
    // Last engine start failure reported this session (pushed by python as
    // localEngineStartFailed); drives the Settings banner until a Repair or
    // Restart succeeds.
    startError: null,
  },
  reducers: {
    setLocalEngineStatus: (state, action) => {
      state.status = action.payload;
    },
    setLocalEngineInstallEvent: (state, action) => {
      const ev = action.payload || {};
      state.install.event = ev;
      // Only setLocalEngineInstallDone ends the flow. Keeping `active` true
      // through an error event means the modal never flashes back to the
      // install prompt between the failure and the terminal done payload.
      if (ev.stage !== "done" && ev.status !== "error") {
        state.install.active = true;
      }
      if (ev.stage && ev.stage !== "done") {
        // done/error are sticky: a late progress event must never un-check a
        // finished step (the backend keeps one ticker per stage, so this is
        // belt-and-braces).
        const cur = state.install.stages[ev.stage];
        if (cur !== "done" && cur !== "error") {
          state.install.stages[ev.stage] =
            ev.status === "done" ? "done" : ev.status === "error" ? "error" : "active";
        }
      }
    },
    setLocalEngineInstallDone: (state, action) => {
      state.install.active = false;
      state.install.done = action.payload; // {ok, error?}
    },
    setLocalEngineInstallActive: (state, action) => {
      state.install.active = action.payload === true;
      if (action.payload === true) {
        // A fresh install starts from a clean checklist.
        state.install.done = null;
        state.install.event = null;
        state.install.stages = {};
      }
    },
    setSetupModalOpen: (state, action) => {
      // Boolean payload. Nothing is queued for replay — closing the modal
      // ends the flow; the user repeats the action after installing.
      const open = action.payload === true;
      if (open && !state.install.active) {
        // A modal opened outside a live install always branches on the
        // current engine status, never on a previous flow's terminal screen.
        state.install.done = null;
        state.install.event = null;
        state.install.stages = {};
      }
      state.setupModalOpen = open;
    },
    setSetupModalMode: (state, action) => {
      // Only the destructive confirm screens are special; anything else is
      // the default install/repair flow.
      state.setupModalMode =
        action.payload === "uninstall" || action.payload === "reset"
          ? action.payload
          : "default";
    },
    setLocalEngineStartError: (state, action) => {
      state.startError = action.payload;
    },
  },
});

export const {
  setLocalEngineStatus,
  setLocalEngineInstallEvent,
  setLocalEngineInstallDone,
  setLocalEngineInstallActive,
  setSetupModalOpen,
  setSetupModalMode,
  setLocalEngineStartError,
} = localEngineSlice.actions;
