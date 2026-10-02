import {
  IonButton,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonModal,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { closeSetupModal, refreshTtsStatus } from "../../api/tts";
import { pyTtsCancelInstall, pyTtsInstall } from "../../api/PythonBridge/senders/pyTtsInstall";
import { setTtsInstallActive } from "../../api/redux/slices/tts";
import "./VoiceSetupModal.css";

/**
 * Voice setup: one honest screen — what this is, what it costs (bytes), one
 * button. While the bootstrap runs on the python side, stage events stream in
 * (uv -> python -> venv -> engine -> spacy -> ja? -> model -> test). Nothing
 * is replayed after a successful install — the modal closes and the user
 * repeats the voice action (speak / generate audio).
 *
 * Two modes (state.tts.setupModalMode):
 *   default — first-use install or repair, with an optional ja checkbox.
 *   add_ja  — incremental Japanese pack for an already installed engine;
 *             runs only the ja sync + test, and Cancel never touches the
 *             existing core engine.
 *
 * The modal is deliberately not dismissable: no X, no Esc, no overlay
 * click. Hiding it would leave the install running in the background with
 * partial files on disk. The only exit is Cancel, which stops the bootstrap
 * (and, in default mode, deletes every file the attempt wrote) before the
 * modal closes. After a completed install the exit is Done (there is nothing
 * to undo).
 */

// The install pipeline, in order. The modal renders this as a static
// checklist: every runnable step is visible from the start as a to-do (empty
// checkbox) and flips to a checkmark as its stage event lands. The Japanese
// row only appears when it was requested.
const INSTALL_STEPS = [
  { stage: "uv", label: "Preparing installer (uv)" },
  { stage: "python", label: "Installing Python runtime" },
  { stage: "venv", label: "Creating voice environment" },
  { stage: "engine", label: "Installing engine packages (PyTorch)" },
  { stage: "spacy", label: "Installing English tokenizer" },
  { stage: "ja", label: "Installing Japanese voice pack", japanese: true },
  { stage: "model", label: "Fetching Kokoro-82M voice model" },
  { stage: "test", label: "Verifying synthesis" },
];

// The incremental add-on flow (mode "add_ja"): only the pack sync + a
// Japanese synthesis run — no venv rebuild, no core re-download.
const JA_INSTALL_STEPS = [
  { stage: "ja", label: "Installing Japanese voice pack" },
  { stage: "test", label: "Verifying Japanese synthesis" },
];
export function VoiceSetupModal() {
  const dispatch = useDispatch();
  const open = useSelector((state) => state.tts.setupModalOpen);
  const mode = useSelector((state) => state.tts.setupModalMode);
  const status = useSelector((state) => state.tts.status);
  const install = useSelector((state) => state.tts.install);
  const [includeJa, setIncludeJa] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const jaMode = mode === "add_ja";

  // Opening the install/repair prompt mirrors the engine's current state: a
  // repair of an engine that already has the ja pack keeps the checkbox
  // checked, so it reflects "what will be installed", not a stale default.
  // (Deps are deliberately just open/mode — the sync happens on open.)
  useEffect(() => {
    if (open && !jaMode) {
      setIncludeJa(!!(status && status.ja_pack));
    }
  }, [open, jaMode]);

  if (!open) return null;

  const unsupported = status && status.status === "unsupported";
  const estimate = (status && status.estimate) || { download_mb: 700, disk_mb: 1600, ja_extra_mb: 300 };
  const alreadyInstalled = status && (status.status === "supported-and-installed" || status.groups?.core);
  const active = install.active;
  const event = install.event || {};
  const done = install.done;

  const pct =
    event.estimate_mb > 0
      ? Math.min(100, Math.round((100 * (event.received_mb || 0)) / event.estimate_mb))
      : 0;

  const stages = install.stages || {};
  const steps = jaMode
    ? JA_INSTALL_STEPS
    : INSTALL_STEPS.filter((s) => !s.japanese || includeJa);
  const currentStep = steps.find((s) => stages[s.stage] === "active");
  const failedStep = steps.find((s) => stages[s.stage] === "error");
  const heading = event.message || (currentStep ? currentStep.label : "Preparing…");

  const startInstall = () => {
    setCancelError(null);
    dispatch(setTtsInstallActive(true));
    pyTtsInstall(jaMode ? ["ja"] : includeJa ? ["core", "ja"] : ["core"]);
  };

  /**
   * The one exit. If nothing has been started (prompt / unsupported screen)
   * this only closes — in Repair mode an already installed engine is left
   * untouched. If an install is running or a previous attempt failed, it
   * stops the bootstrap and (default mode only) deletes the whole partial
   * tree on the python side before closing; ja mode preserves the installed
   * core engine. A cleanup failure (locked files) keeps the modal open so
   * the user can retry.
   */
  const handleCancel = async () => {
    if (cancelling) return;
    if (!active && !(done && !done.ok)) {
      closeSetupModal();
      return;
    }
    setCancelling(true);
    setCancelError(null);
    let res = null;
    try {
      res = await pyTtsCancelInstall({ preserveCore: jaMode });
    } catch (e) {
      res = { ok: false, error: String(e && e.message ? e.message : e) };
    }
    setCancelling(false);
    if (res && res.ok) {
      dispatch(setTtsInstallActive(false));
      closeSetupModal();
      refreshTtsStatus();
    } else {
      setCancelError(
        String((res && res.error) || "Could not cancel the install.").slice(0, 300)
      );
    }
  };

  return (
    <IonModal isOpen={open} backdropDismiss={false} canDismiss={false}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>AnkiBrain Voice</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="VoiceSetupModal">
          {cancelling && (
            <div className="VoiceSetupModal-center">
              <IonSpinner name="circular" />
              <p>Cancelling…</p>
              <p className="VoiceSetupModal-hint">
                {jaMode
                  ? "Stopping the installer. The installed voice engine is not affected."
                  : "Stopping the installer and removing downloaded files."}
              </p>
            </div>
          )}

          {!cancelling && unsupported && (
            <>
              <p>
                {(status && status.reason) ||
                  "This platform is not supported by the voice engine."}
              </p>
              <IonButton expand="block" fill="clear" onClick={handleCancel}>
                Cancel
              </IonButton>
            </>
          )}

          {!cancelling && !unsupported && !active && !done && (
            <>
              {jaMode ? (
                <>
                  <p>
                    Add the Japanese language pack to the installed voice engine.
                  </p>
                  <p className="VoiceSetupModal-hint">
                    Download ≈ {estimate.ja_extra_mb} MB · Japanese voices and
                    text-to-speech support.
                  </p>
                  <IonButton
                    expand="block"
                    color="accent"
                    className="VoiceSetupModal-installBtn"
                    onClick={startInstall}
                  >
                    Install Japanese pack
                  </IonButton>
                </>
              ) : (
                <>
                  <p>
                    {alreadyInstalled
                      ? "Reinstall or repair the Kokoro voice engine."
                      : "Free text-to-speech (TTS) with Kokoro voice engine."}
                  </p>
                  <p className="VoiceSetupModal-hint">
                    Download ≈ {estimate.download_mb} MB · Disk ≈ {estimate.disk_mb} MB
                  </p>
                  <p className="VoiceSetupModal-hint VoiceSetupModal-hint--low">
                    Languages: English, Spanish, French, Hindi, Italian, Portuguese,
                    Chinese.
                  </p>
                  <IonCheckbox
                    className="VoiceSetupModal-checkbox"
                    checked={includeJa}
                    onIonChange={(e) => setIncludeJa(e.detail.checked)}
                  >
                    Also install Japanese{" "}
                    <span className="VoiceSetupModal-hint">
                      (+{estimate.ja_extra_mb} MB)
                    </span>
                  </IonCheckbox>
                  <IonButton
                    expand="block"
                    color="accent"
                    className="VoiceSetupModal-installBtn"
                    onClick={startInstall}
                  >
                    {alreadyInstalled ? "Repair voice engine" : "Install voice engine"}
                  </IonButton>
                </>
              )}
              <IonButton expand="block" fill="clear" onClick={handleCancel}>
                Cancel
              </IonButton>
            </>
          )}

          {!cancelling && !unsupported && active && (
            <div className="VoiceSetupModal-active">
              <div className="VoiceSetupModal-progressRow">
                <IonSpinner name="dots" className="VoiceSetupModal-spinner" />
                <span className="VoiceSetupModal-heading">{heading}</span>
              </div>
              {event.estimate_mb > 0 && (
                <div className="VoiceSetupModal-progress">
                  <IonProgressBar value={pct / 100} />
                  <span className="VoiceSetupModal-hint VoiceSetupModal-progressText">
                    {event.received_mb || 0} / ~{event.estimate_mb} MB
                  </span>
                </div>
              )}
              <ul className="VoiceSetupModal-steps">
                {steps.map((s) => {
                  const st = stages[s.stage] || "todo";
                  return (
                    <li
                      key={s.stage}
                      className={`VoiceSetupModal-step VoiceSetupModal-step--${st}`}
                    >
                      <span className="VoiceSetupModal-stepMarker">
                        {st === "done" ? (
                          "✓"
                        ) : st === "error" ? (
                          "✗"
                        ) : st === "active" ? (
                          <IonSpinner name="dots" />
                        ) : (
                          "☐"
                        )}
                      </span>
                      <span className="VoiceSetupModal-stepLabel">{s.label}</span>
                    </li>
                  );
                })}
              </ul>
              <IonButton
                fill="clear"
                className="VoiceSetupModal-cancelBtn"
                onClick={handleCancel}
              >
                Cancel
              </IonButton>
            </div>
          )}

          {!cancelling && !unsupported && done && done.ok && (
            <>
              <p className="VoiceSetupModal-success">
                {jaMode
                  ? "Japanese voice pack installed. Pick a Japanese voice from the Language menu in Settings."
                  : "Voice engine ready. Click the voice button again to use it."}
              </p>
              <IonButton
                expand="block"
                color="accent"
                onClick={closeSetupModal}
              >
                Done
              </IonButton>
            </>
          )}

          {!cancelling && !unsupported && done && !done.ok && (
            <>
              <p className="VoiceSetupModal-error">Install failed</p>
              {failedStep && (
                <p className="VoiceSetupModal-hint">
                  Failed at: {failedStep.label}
                </p>
              )}
              <p className="VoiceSetupModal-errorDetail">
                {done.error && done.error.message ? String(done.error.message).slice(0, 400) : "Unknown error"}
              </p>
              {done.error && done.error.hint && (
                <p className="VoiceSetupModal-hint">{done.error.hint}</p>
              )}
              <IonButton
                expand="block"
                color="accent"
                className="VoiceSetupModal-installBtn"
                onClick={startInstall}
              >
                Retry
              </IonButton>
              <IonButton expand="block" fill="clear" onClick={handleCancel}>
                Cancel
              </IonButton>
            </>
          )}

          {cancelError && (
            <p className="VoiceSetupModal-error VoiceSetupModal-cancelError">
              {cancelError}
            </p>
          )}
        </div>
      </IonContent>
    </IonModal>
  );
}
