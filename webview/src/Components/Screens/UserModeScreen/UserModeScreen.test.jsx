import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import App from "../../../App";
import { store } from "../../../api/redux";
import { setAppDidBoot } from "../../../api/redux/slices/appDidBoot";
import { setBoolGlobalLoadingIndicator } from "../../../api/redux/slices/bGlobalLoadingIndicator";
import { setUserMode } from "../../../api/redux/slices/userMode";
import { setUserModeSelectorOpen } from "../../../api/redux/slices/userModeSelector";
import { pySetUserMode } from "../../../api/PythonBridge/senders/pySetUserMode";
import { UserModeScreen } from "./UserModeScreen";

// The bridge sender is a real async round trip in Anki; here it is a stub so
// the test can assert exactly which mode a click asks for.
vi.mock("../../../api/PythonBridge/senders/pySetUserMode", () => ({
  pySetUserMode: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  pySetUserMode.mockResolvedValue({ ok: true, mode: "SERVER" });
  store.dispatch(setUserMode(null));
  store.dispatch(setUserModeSelectorOpen(false));
});

function renderScreen() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChakraProvider>
          <UserModeScreen />
        </ChakraProvider>
      </MemoryRouter>
    </Provider>
  );
}

test("Regular mode is the prominent default and switches in one click", async () => {
  renderScreen();

  const regular = screen.getByRole("button", {
    name: /Regular mode \(recommended\)/,
  });
  expect(regular).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Local mode \(advanced users only\)/ })
  ).toBeInTheDocument();

  fireEvent.click(regular);

  await waitFor(() => expect(pySetUserMode).toHaveBeenCalledWith("SERVER"));
});

test("Local mode asks for confirmation before switching", async () => {
  renderScreen();

  fireEvent.click(
    screen.getByRole("button", { name: /Local mode \(advanced users only\)/ })
  );

  expect(screen.getByText("Set up Local mode?")).toBeInTheDocument();
  expect(pySetUserMode).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("button", { name: "Continue with local mode" })
  );

  await waitFor(() => expect(pySetUserMode).toHaveBeenCalledWith("LOCAL"));
});

test("cancelling the Local confirmation switches nothing", async () => {
  renderScreen();

  fireEvent.click(
    screen.getByRole("button", { name: /Local mode \(advanced users only\)/ })
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(pySetUserMode).not.toHaveBeenCalled();
  // Chakra keeps the node mounted through its leave transition.
  await waitFor(() =>
    expect(screen.queryByText("Set up Local mode?")).toBeNull()
  );
});

test("App replaces the whole shell with the gate while no mode is chosen", () => {
  // "/" is an unmatched route, so the shell is provable by .MainAppArea alone.
  const { container } = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    </Provider>
  );
  act(() => {
    store.dispatch(setAppDidBoot(true));
    store.dispatch(setBoolGlobalLoadingIndicator(false));
  });

  expect(screen.getByText("Welcome to AnkiBrain")).toBeInTheDocument();
  expect(container.querySelector(".MainAppArea")).toBeNull();
  // First launch has nothing to go back to.
  expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();
});

test("the SERVER auth gate can hand the panel to the selector and take it back", async () => {
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    </Provider>
  );
  act(() => {
    store.dispatch(setUserMode("SERVER"));
    store.dispatch(setAppDidBoot(true));
    store.dispatch(setBoolGlobalLoadingIndicator(false));
  });

  // The auth gate owns the panel, with the switch affordance on its card.
  expect(screen.getByRole("button", { name: "Use a different mode" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Use a different mode" }));

  expect(screen.getByText("Welcome to AnkiBrain")).toBeInTheDocument();
  expect(screen.getByText("Setup")).toBeInTheDocument();
  expect(pySetUserMode).not.toHaveBeenCalled();

  // Back returns to the gate that was up, with nothing switched.
  fireEvent.click(screen.getByRole("button", { name: /Back/ }));

  await waitFor(() =>
    expect(screen.queryByText("Welcome to AnkiBrain")).toBeNull()
  );
  expect(screen.getByRole("button", { name: "Use a different mode" })).toBeInTheDocument();
  expect(pySetUserMode).not.toHaveBeenCalled();
});

test("the selector compares the modes the way the old dialog did", () => {
  renderScreen();

  for (const aspect of [
    "Setup",
    "Speed",
    "AI runs on",
    "Cost",
    "Every computer",
    "Difficulty",
  ]) {
    expect(screen.getByText(aspect)).toBeInTheDocument();
  }
  expect(screen.getByText("AnkiBrain's servers")).toBeInTheDocument();
  expect(screen.getByText("This computer")).toBeInTheDocument();
  expect(screen.getByText("Fastest")).toBeInTheDocument();
  expect(screen.getByText("Often slower")).toBeInTheDocument();
  expect(screen.getByText("Easy")).toBeInTheDocument();
  expect(screen.getByText("Advanced")).toBeInTheDocument();
  expect(screen.getByText("Sign in anywhere")).toBeInTheDocument();
  expect(screen.getByText("This computer only")).toBeInTheDocument();
  // Local's costs are stated before anything is downloaded.
  expect(screen.getByText(/1\.2 GB download/)).toBeInTheDocument();
});
