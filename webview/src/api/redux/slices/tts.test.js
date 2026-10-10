import { store } from "..";
import {
  setSetupModalMode,
  setSetupModalOpen,
  setTtsInstallActive,
  setTtsInstallDone,
  setTtsInstallEvent,
  setTtsSettings,
} from "./tts";

// Isolate the install substate these tests mutate; the store is a singleton
// shared across tests in this file (same convention as cardAudio.test.js).
// Dispatching setTtsInstallActive(true) then (false) resets event/stages/done
// exactly like a fresh install would.
beforeEach(() => {
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(setTtsInstallActive(false));
  store.dispatch(setSetupModalOpen(false));
  store.dispatch(setSetupModalMode("default"));
});

test("opening the setup modal clears a previous flow's terminal result", () => {
  // The uninstall bug: an install completed earlier in the session left
  // done={ok:true}; after uninstalling, opening the modal re-rendered
  // "Voice engine ready" instead of the install prompt (restart masked it by
  // resetting the in-memory store).
  store.dispatch(setTtsInstallDone({ ok: true }));
  store.dispatch(setSetupModalOpen(true));

  const { install, setupModalOpen } = store.getState().tts;
  expect(setupModalOpen).toBe(true);
  expect(install.done).toBeNull();
  expect(install.stages).toEqual({});
});

test("opening during an active install preserves progress state", () => {
  store.dispatch(
    setTtsInstallEvent({ stage: "venv", status: "start", message: "Syncing…" })
  );
  store.dispatch(setSetupModalOpen(true));

  const { install } = store.getState().tts;
  expect(install.active).toBe(true);
  expect(install.event.stage).toBe("venv");
  expect(install.stages.venv).toBe("active");
});

test("checklist marks each step done and keeps it done", () => {
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(setTtsInstallEvent({ stage: "uv", status: "progress", message: "…" }));
  expect(store.getState().tts.install.stages.uv).toBe("active");

  store.dispatch(setTtsInstallEvent({ stage: "uv", status: "done", message: "uv ready" }));
  expect(store.getState().tts.install.stages.uv).toBe("done");

  // A late progress event must never un-check a finished step.
  store.dispatch(setTtsInstallEvent({ stage: "uv", status: "progress", message: "…" }));
  expect(store.getState().tts.install.stages.uv).toBe("done");
});

test("a failed step stays active until the terminal done payload", () => {
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(setTtsInstallEvent({ stage: "model", status: "error", message: "boom" }));

  let install = store.getState().tts.install;
  expect(install.active).toBe(true);
  expect(install.stages.model).toBe("error");

  store.dispatch(
    setTtsInstallDone({ ok: false, error: { code: "model", message: "boom", hint: null } })
  );
  install = store.getState().tts.install;
  expect(install.active).toBe(false);
  expect(install.done.ok).toBe(false);
});

test("starting a new install clears the previous checklist", () => {
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(setTtsInstallEvent({ stage: "uv", status: "done", message: "uv ready" }));

  store.dispatch(setTtsInstallDone({ ok: true }));
  store.dispatch(setTtsInstallActive(true));

  const { install } = store.getState().tts;
  expect(install.stages).toEqual({});
  expect(install.event).toBeNull();
  expect(install.done).toBeNull();
  expect(install.active).toBe(true);
});

test("setup modal mode only treats add_ja as special", () => {
  store.dispatch(setSetupModalMode("add_ja"));
  expect(store.getState().tts.setupModalMode).toBe("add_ja");

  // Anything unexpected falls back to the default install/repair flow.
  store.dispatch(setSetupModalMode("repair"));
  expect(store.getState().tts.setupModalMode).toBe("default");
});

test("auto language detection defaults on and hydrates from settings", () => {
  store.dispatch(setTtsSettings({}));
  expect(store.getState().tts.settings.ttsAutoDetect).toBe(true);

  store.dispatch(setTtsSettings({ ttsAutoDetect: false }));
  expect(store.getState().tts.settings.ttsAutoDetect).toBe(false);

  // Restore the default for any later test in this file.
  store.dispatch(setTtsSettings({ ttsAutoDetect: true }));
});
