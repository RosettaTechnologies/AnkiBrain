import { store } from "../redux";
import { setSpeaking } from "../redux/slices/tts";

/**
 * Single shared audio element for all TTS playback (side panel is the only
 * consumer). file:// URLs work because the webview loads its own dist from
 * file:// with LocalContentCanAccessFileUrls on — same origin, same trick
 * media_tmp image previews use.
 */
let audio = null;
let currentUrl = null;

function setState(text) {
  store.dispatch(setSpeaking(text ? { text } : null));
}

export function playTtsUrl(url, label = "") {
  if (!url) return;
  if (audio) {
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
  }
  audio = new Audio(url);
  currentUrl = url;
  setState(label || "Speaking…");
  audio.onended = () => setState(null);
  audio.onerror = () => setState(null);
  audio.play().catch(() => setState(null));
}

export function stopTts() {
  if (audio) {
    audio.pause();
    audio = null;
  }
  currentUrl = null;
  setState(null);
}

export function isPlayingUrl(url) {
  return audio && currentUrl === url && !audio.paused;
}
