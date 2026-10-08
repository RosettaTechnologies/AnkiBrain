import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { setUser, store } from "./api/redux";
import { setAppDidBoot } from "./api/redux/slices/appDidBoot";
import { setBoolGlobalLoadingIndicator } from "./api/redux/slices/bGlobalLoadingIndicator";
import { setLocalEngineStatus } from "./api/redux/slices/localEngine";
import { setUserMode } from "./api/redux/slices/userMode";

// App.jsx's LOCAL-mode gate: the app shell must not render while the engine is
// missing. "/" is an unmatched route, so the shell is provable by
// .MainAppArea alone without mounting a heavy screen.
beforeEach(() => {
  store.dispatch(setUserMode("LOCAL"));
  store.dispatch(setUser(null));
  store.dispatch(setAppDidBoot(true));
  store.dispatch(setLocalEngineStatus(null));
});

function renderApp() {
  const utils = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    </Provider>
  );
  // App's mount effect flips the global loader on; boot is over in this test.
  act(() => store.dispatch(setBoolGlobalLoadingIndicator(false)));
  return utils;
}

test("LOCAL mode without an engine shows the gate, not the app shell", () => {
  store.dispatch(setLocalEngineStatus({ status: "supported-but-absent" }));
  const { container } = renderApp();

  expect(screen.getByText("Install engine")).toBeInTheDocument();
  expect(container.querySelector(".MainAppArea")).toBeNull();
});

test("LOCAL mode with the engine installed shows the app shell", () => {
  store.dispatch(setLocalEngineStatus({ status: "supported-and-installed" }));
  const { container } = renderApp();

  expect(container.querySelector(".MainAppArea")).not.toBeNull();
  expect(screen.queryByText("Install engine")).toBeNull();
});

test("SERVER mode never gates on the engine", () => {
  // A verified user also keeps the *auth* gate (needsAuth) out of the way, so
  // a rendered .MainAppArea proves the engine gate alone stayed off.
  // (balance/monthlyStorageCharge are what SideBar prints.)
  store.dispatch(setUserMode("SERVER"));
  store.dispatch(
    setUser({
      isVerified: true,
      email: "user@example.com",
      balance: 0,
      monthlyStorageCharge: 0,
    })
  );
  const { container } = renderApp();

  expect(container.querySelector(".MainAppArea")).not.toBeNull();
  expect(screen.queryByText("Install engine")).toBeNull();
});
