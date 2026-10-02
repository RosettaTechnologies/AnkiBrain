import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";
import { store } from "../../redux";
import {
  audioJobStarted,
  audioJobSettled,
  audioJobFailed,
  audioRetryQueued,
} from "../../redux/slices/cardAudio";
import { openSetupModal } from "../../tts";
import { errorToast, infoToast } from "../../toast";

/*
 * Queue audio items for synthesis. Python walks the batch sequentially (one
 * engine call at a time) pushing CARD_AUDIO_RESULT per finished clip, then
 * acks with DID_GENERATE_CARD_AUDIO. Every caller — per-field buttons,
 * "Generate audio for all cards", mode auto-enqueue, and the post-install
 * retry — funnels through here so job bookkeeping lives in one place.
 */
export async function requestAudioGeneration(items) {
  if (!items || items.length === 0) {
    return;
  }

  store.dispatch(audioJobStarted(items));

  try {
    await asendPythonCommand(IC.GENERATE_CARD_AUDIO, { items });

    // Ack arrived — every result was pushed before it — so any still-marked
    // item vanished silently (cancelled engine-side, or a result event lost
    // to a restart). Drop the mark so it can never gate Add-to-Anki forever.
    for (const item of items) {
      store.dispatch(audioJobSettled({ uid: item.uid, field: item.field }));
    }
  } catch (err) {
    handleBatchFailure(items, err);
  }
}

/*
 * Batch-level failures carry stable sentinels (see ReactBridge
 * _a_generate_card_audio). Per-clip synth errors are NOT here — those arrive
 * as CARD_AUDIO_RESULT {ok:false} while the batch continues.
 */
function handleBatchFailure(items, err) {
  const msg = String(err?.message ?? err ?? "");
  for (const item of items) {
    store.dispatch(audioJobSettled({ uid: item.uid, field: item.field }));
  }

  if (msg.includes("TTS_NOT_INSTALLED") || msg.includes("TTS_PACK_MISSING")) {
    // Park the batch; the setup modal's one-click install ends with
    // TTS_INSTALL_DONE ok → retryQueuedAudioJobs() replays exactly these.
    store.dispatch(audioRetryQueued(items));
    openSetupModal(null);
    return;
  }

  if (msg.startsWith("TTS_UNSUPPORTED:")) {
    infoToast(
      "Card Audio",
      msg.slice("TTS_UNSUPPORTED:".length).slice(0, 300) ||
        "The voice engine does not support this platform.",
      10000
    );
    return;
  }

  if (msg.includes("TTS_DISABLED")) {
    infoToast("Card Audio", "Voice is turned off in Settings.");
    return;
  }

  for (const item of items) {
    store.dispatch(
      audioJobFailed({ uid: item.uid, field: item.field, message: msg.slice(0, 200) })
    );
  }
  errorToast("Card Audio Error", msg.slice(0, 300));
}
