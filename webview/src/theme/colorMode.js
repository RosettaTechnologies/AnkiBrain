import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setColorMode } from "../api/redux/slices/colorMode";
import { pyEditSetting } from "../api/PythonBridge/senders/pyEditSetting";

/**
 * Ionic color-mode bridge.
 *
 * Replaces Chakra's `useColorMode` for the Ionic UI. The color mode stays in
 * the Redux `colorMode` slice because the Python layer persists it in
 * settings.json (and hydrates it back on boot via DID_LOAD_SETTINGS); this
 * module only mirrors that state onto the `.ion-palette-dark` class that
 * Ionic's `dark.class.css` palette listens for.
 */

/** Apply the palette class to <html> so Ionic's dark palette takes effect. */
export function applyIonPalette(colorMode) {
  const root = document.documentElement;
  if (colorMode === "light") {
    root.classList.remove("ion-palette-dark");
  } else {
    root.classList.add("ion-palette-dark");
  }
}

/**
 * Keep the palette class in sync with the store for the lifetime of the app.
 * Called once from index.jsx, so the class is correct even before any
 * component using the hook mounts.
 */
export function initIonColorMode(store) {
  const apply = () => applyIonPalette(store.getState().colorMode.value);
  apply();
  store.subscribe(apply);
}

/** Redux-backed drop-in replacement for Chakra's `useColorMode`. */
export function useColorMode() {
  const colorMode = useSelector((state) => state.colorMode.value) || "dark";
  const dispatch = useDispatch();

  const toggleColorMode = useCallback(() => {
    const next = colorMode === "dark" ? "light" : "dark";
    dispatch(setColorMode(next));
    return pyEditSetting("colorMode", next);
  }, [colorMode, dispatch]);

  return { colorMode, toggleColorMode };
}
