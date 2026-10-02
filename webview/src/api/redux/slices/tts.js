import { createSlice } from "@reduxjs/toolkit";

export const ttsSlice = createSlice({
  name: "tts",
  initialState: {
    // Raw payload of DID_TTS_STATUS (python voice.state.current_status()).
    status: null,
    // Bootstrap state for the setup modal: latest stage event + a per-stage
    // checklist (stage -> "active" | "done" | "error") the modal renders as a
    // static to-do/done list. Terminal result lives in `done`.
    install: { active: false, event: null, stages: {}, done: null },
    // Voice Setup modal (install/repair UI).
    setupModalOpen: false,
    // Which flow the modal renders: "default" (install/repair with the
    // optional ja checkbox) or "add_ja" (incremental Japanese pack for an
    // already installed engine).
    setupModalMode: "default",
    // Currently speaking indicator {text}.
    speaking: null,
    // Voice settings echoed from DID_LOAD_SETTINGS so the Settings screen
    // has a single source even before a TTS_STATUS round trip. There is no
    // enable/disable switch: the engine is active iff it is installed.
    settings: {
      ttsVoice: "af_heart",
      ttsSpeed: 1.0,
      // Engine-side source-language detection (on by default): foreign text
      // is spoken with a first voice of its detected language; ttsVoice is
      // the fallback for uncertain/unsupported text.
      ttsAutoDetect: true,
      // Review-screen TTS policy (none|front|back|both): drives the
      // auto-enqueue of audio for freshly generated cards and the target of
      // "Generate audio for all cards".
      ttsCardAudioMode: "none",
    },
  },
  reducers: {
    setTtsStatus: (state, action) => {
      state.status = action.payload;
    },
    setTtsInstallEvent: (state, action) => {
      const ev = action.payload || {};
      state.install.event = ev;
      // Only setTtsInstallDone ends the flow. Keeping `active` true through
      // an error event means the modal never flashes back to the install
      // prompt between the failure and the terminal done payload.
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
    setTtsInstallDone: (state, action) => {
      state.install.active = false;
      state.install.done = action.payload; // {ok, error?}
    },
    setTtsInstallActive: (state, action) => {
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
      // ends the flow; the user repeats the voice action after installing.
      const open = action.payload === true;
      if (open && !state.install.active) {
        // A modal opened outside a live install always branches on the
        // current engine status, never on a previous flow's terminal screen.
        // Without this, uninstalling after an earlier install in the same
        // session leaves done={ok:true} behind and the modal renders "Voice
        // engine ready" instead of the install prompt (restart masked it by
        // resetting the in-memory store).
        state.install.done = null;
        state.install.event = null;
        state.install.stages = {};
      }
      state.setupModalOpen = open;
    },
    setSetupModalMode: (state, action) => {
      // Only "add_ja" is special; anything else is the default flow.
      state.setupModalMode = action.payload === "add_ja" ? "add_ja" : "default";
    },
    setSpeaking: (state, action) => {
      state.speaking = action.payload;
    },
    setTtsSettings: (state, action) => {
      state.settings = { ...state.settings, ...action.payload };
    },
    editTtsSettingLocal: (state, action) => {
      state.settings[action.payload.key] = action.payload.value;
    },
  },
});

export const {
  setTtsStatus,
  setTtsInstallEvent,
  setTtsInstallDone,
  setTtsInstallActive,
  setSetupModalOpen,
  setSetupModalMode,
  setSpeaking,
  setTtsSettings,
  editTtsSettingLocal,
} = ttsSlice.actions;
