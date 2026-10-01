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
    // Text that triggered the modal (auto re-spoken after a successful
    // install) — the whole point of the first-use UX being one click deep.
    pendingText: null,
    // Currently speaking indicator {text}.
    speaking: null,
    // Voice settings echoed from DID_LOAD_SETTINGS so the Settings screen
    // has a single source even before a TTS_STATUS round trip.
    settings: {
      ttsEnabled: true,
      ttsVoice: "af_heart",
      ttsSpeed: 1.0,
      ttsEmbedCardAudio: true,
      ttsCardAudioSides: "answer",
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
      state.setupModalOpen = action.payload.open === true;
      if ("pendingText" in action.payload) {
        state.pendingText = action.payload.pendingText;
      }
    },
    clearPendingText: (state) => {
      state.pendingText = null;
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
  clearPendingText,
  setSpeaking,
  setTtsSettings,
  editTtsSettingLocal,
} = ttsSlice.actions;
