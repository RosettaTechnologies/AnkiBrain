// Smoke test: verifies the app's Redux wiring boots under the Vite/Vitest
// toolchain. (The original CRA boilerplate test rendered <App /> without the
// required Provider/Router wrappers and asserted on CRA demo text that never
// existed in this app; it could not pass in either toolchain.)
import { store } from "./api/redux";
import { setBoolGlobalLoadingIndicator } from "./api/redux/slices/bGlobalLoadingIndicator";

test("redux store is configured and responds to actions", () => {
  store.dispatch(setBoolGlobalLoadingIndicator(true));
  expect(store.getState().bGlobalLoadingIndicator.value).toBe(true);

  store.dispatch(setBoolGlobalLoadingIndicator(false));
  expect(store.getState().bGlobalLoadingIndicator.value).toBe(false);
});
