import { toastController } from "@ionic/core";

/*
 * Ionic-backed toast helpers. Same three exports and signatures as the old
 * Chakra-based module, so every existing call site keeps working unchanged.
 */

let activeToast = null;

async function showToast({ header, message, duration, color }) {
  // Ionic stacks toasts; replace any active one so bursts of notifications
  // (e.g. several Python errors in a row) don't pile up on screen.
  if (activeToast) {
    try {
      await activeToast.dismiss();
    } catch {
      // Already dismissed by its own duration/button — nothing to do.
    }
    activeToast = null;
  }

  const toast = await toastController.create({
    header,
    message,
    duration,
    color,
    position: "bottom",
    buttons: [{ text: "Dismiss", role: "cancel" }],
  });

  activeToast = toast;
  toast.onDidDismiss().then(() => {
    if (activeToast === toast) {
      activeToast = null;
    }
  });

  await toast.present();
}

export function successToast(
  title = "Success",
  message = "",
  duration = 10000
) {
  return showToast({ header: title, message, duration, color: "success" });
}

export function errorToast(title = "Error", message = "", duration = 10000) {
  return showToast({ header: title, message, duration, color: "danger" });
}

export function infoToast(title = "Info", message = "", duration = 10000) {
  return showToast({ header: title, message, duration, color: "primary" });
}
