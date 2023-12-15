import { store } from "./redux";

export function isDevMode() {
  return store.getState().devMode.value;
}
