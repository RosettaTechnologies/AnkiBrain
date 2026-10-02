import { createSlice } from "@reduxjs/toolkit";

export const ttsSlice = createSlice({
  name: "tts",
  initialState: {
    // Raw payload of DID_TTS_STATUS (python voice.state.current_status()).
    status: null,
    // Latest bootstrap progress event + a short rolling log for the modal.
    install: { active: false, event: null, log: [], done: null },
    // Voice Setup modal (install/repair UI).
    setupModalOpen: false,
    // Currently speaking indicator {text}.
    speaking: null,
    // Voice settings echoed from DID_LOAD_SETTINGS so the Settings screen
    // has a single source even before a TTS_STATUS round trip. There is no
    // enable/disable switch: the engine is active iff it is installed.
    settings: {
      ttsVoice: "af_heart",
      ttsSpeed: 1.0,
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
      const ev = action.payload;
      state.install.active = !(ev.stage === "done" || ev.status === "error");
      state.install.event = ev;
      if (ev.status === "start" || ev.status === "done" || ev.status === "error") {
        state.install.log.push(ev);
        if (state.install.log.length > 12) state.install.log.shift();
      }
    },
    setTtsInstallDone: (state, action) => {
      state.install.active = false;
      state.install.done = action.payload; // {ok, error?}
    },
    setTtsInstallActive: (state, action) => {
      state.install.active = action.payload;
      if (action.payload) state.install.done = null;
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
        state.install.log = [];
      }
      state.setupModalOpen = open;
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
  setSpeaking,
  setTtsSettings,
  editTtsSettingLocal,
} = ttsSlice.actions;
