import { createStandaloneToast } from "@chakra-ui/react";
import { store } from "./redux";
import { pushErrorDialog } from "./redux/slices/errorDialog";

const { toast } = createStandaloneToast();

// Corner placement + subtle variant: a confirmation should not cover the
// working area or shout. Durations are short because every success here is
// also visible in the UI state that changed.
const TOAST_DEFAULTS = {
  position: "bottom-right",
  variant: "subtle",
  isClosable: true,
};

// The same title+message arriving twice within this window is one event
// (e.g. a request that fails and is reported by both _fetch and its caller).
const DEDUPE_MS = 2000;
const recent = new Map();

function isDuplicate(key) {
  const now = Date.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) {
    return true;
  }
  recent.set(key, now);
  if (recent.size > 50) {
    for (const [k, t] of recent) {
      if (now - t >= DEDUPE_MS) {
        recent.delete(k);
      }
    }
  }
  return false;
}

function notify(status, title, message, duration) {
  const text = String(message ?? "");
  if (isDuplicate(`${status}|${title}|${text}`)) {
    return;
  }
  toast({ title, description: text, status, duration, ...TOAST_DEFAULTS });
}

export function successToast(title = "Success", message = "", duration = 3000) {
  notify("success", title, message, duration);
}

export function infoToast(title = "Info", message = "", duration = 4000) {
  notify("info", title, message, duration);
}

// Errors are read, not glanced at: they open the queued modal instead of a
// toast. Signature stays (title, message) so every existing call site and test
// mock keeps working; the old `duration` parameter had no caller.
export function errorToast(title = "Error", message = "") {
  const text = String(message ?? "").trim();
  store.dispatch(
    pushErrorDialog({
      title,
      message:
        !text || text === "null" || text === "undefined"
          ? "An unexpected error occurred. Please try again."
          : text,
    })
  );
}
