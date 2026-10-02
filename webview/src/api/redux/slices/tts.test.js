import { store } from "..";
import {
  setSetupModalOpen,
  setTtsInstallDone,
  setTtsInstallEvent,
} from "./tts";

// Isolate the install substate these tests mutate; the store is a singleton
// shared across tests in this file (same convention as cardAudio.test.js).
beforeEach(() => {
  store.dispatch(setSetupModalOpen(false));
  store.dispatch(setTtsInstallDone(null));
});

test("opening the setup modal clears a previous flow's terminal result", () => {
  // The uninstall bug: an install completed earlier in the session left
  // done={ok:true}; after uninstalling, opening the modal re-rendered
  // "Voice engine ready" instead of the install prompt.
  store.dispatch(setTtsInstallDone({ ok: true }));
  store.dispatch(setSetupModalOpen(true));

  const { install, setupModalOpen } = store.getState().tts;
  expect(setupModalOpen).toBe(true);
  expect(install.done).toBeNull();
});

test("opening during an active install preserves progress state", () => {
  store.dispatch(
    setTtsInstallEvent({ stage: "venv", status: "start", message: "Syncing…" })
  );
  store.dispatch(setSetupModalOpen(true));

  const { install } = store.getState().tts;
  expect(install.active).toBe(true);
  expect(install.event.stage).toBe("venv");
});
