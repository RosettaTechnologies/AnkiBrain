import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "../../api/redux";
import {
  setLocalEngineInstallActive,
  setLocalEngineInstallDone,
  setLocalEngineStartError,
  setLocalEngineStatus,
  setSetupModalMode,
  setSetupModalOpen,
} from "../../api/redux/slices/localEngine";
import { handlePythonDataReceived } from "../../api/PythonBridge";
import { LocalEngineSetupModal } from "./LocalEngineSetupModal";
import {
  pyLocalEngineCancelInstall,
  pyLocalEngineInstall,
  pyLocalEngineResetData,
  pyLocalEngineUninstall,
} from "../../api/PythonBridge/senders/pyLocalEngine";

// The component's python senders are fire-and-forget; mock them so tests can
// assert exactly which call a click issues without a live bridge.
vi.mock("../../api/PythonBridge/senders/pyLocalEngine", () => ({
  pyLocalEngineStatus: vi.fn(),
  pyLocalEngineInstall: vi.fn(),
  pyLocalEngineCancelInstall: vi.fn(),
  pyLocalEngineUninstall: vi.fn(),
  pyLocalEngineResetData: vi.fn(),
}));

// The store is a singleton; reset the localEngine substate exactly like a
// fresh session (same convention as the slice tests).
beforeEach(() => {
  vi.clearAllMocks();
  store.dispatch(setLocalEngineInstallActive(true)); // clears event/stages/done
  store.dispatch(setLocalEngineInstallActive(false));
  store.dispatch(setSetupModalOpen(false));
  store.dispatch(setSetupModalMode("default"));
  store.dispatch(setLocalEngineStatus(null));
  store.dispatch(setLocalEngineStartError(null));
});

function renderModal(gate = false) {
  return render(
    <Provider store={store}>
      <ChakraProvider>
        <LocalEngineSetupModal gate={gate} />
      </ChakraProvider>
    </Provider>
  );
}

test("absent status offers Install engine, which starts the bootstrap", () => {
  store.dispatch(
    setLocalEngineStatus({
      status: "supported-but-absent",
      estimate: { download_mb: 380, disk_mb: 1100 },
    })
  );
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  fireEvent.click(screen.getByText("Install engine"));

  expect(pyLocalEngineInstall).toHaveBeenCalled();
});

test("installed status cancel closes the modal without any python call", () => {
  store.dispatch(setLocalEngineStatus({ status: "supported-and-installed" }));
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  fireEvent.click(screen.getByText("Cancel"));

  expect(store.getState().localEngine.setupModalOpen).toBe(false);
  expect(pyLocalEngineInstall).not.toHaveBeenCalled();
  expect(pyLocalEngineCancelInstall).not.toHaveBeenCalled();
  expect(pyLocalEngineUninstall).not.toHaveBeenCalled();
  expect(pyLocalEngineResetData).not.toHaveBeenCalled();
});

test("opening from an autoStart setup-required push starts the install", async () => {
  renderModal();

  await handlePythonDataReceived(
    { cmd: "localEngineSetupRequired", autoStart: true },
    store.dispatch,
    () => {}
  );

  expect(store.getState().localEngine.setupModalOpen).toBe(true);
  expect(pyLocalEngineInstall).toHaveBeenCalled();
});

test("unsupported status renders the platform reason", () => {
  store.dispatch(
    setLocalEngineStatus({
      status: "unsupported",
      reason: "Intel Macs are not supported for Local mode.",
    })
  );
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  expect(
    screen.getByText("Intel Macs are not supported for Local mode.")
  ).toBeInTheDocument();
});

test("installed status with last_error shows the banner and Repair engine", () => {
  store.dispatch(
    setLocalEngineStatus({
      status: "supported-and-installed",
      last_error: {
        code: "start",
        message: "chromadb import failed",
        hint: "Press Repair engine.",
      },
    })
  );
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  expect(screen.getByText("chromadb import failed")).toBeInTheDocument();
  expect(screen.getByText("Repair engine")).toBeInTheDocument();
});

test("gate with an absent engine offers Install engine and no Cancel", () => {
  store.dispatch(setLocalEngineStatus({ status: "supported-but-absent" }));
  renderModal(true);

  expect(screen.getByText("Install engine")).toBeInTheDocument();
  expect(screen.queryByText("Cancel")).toBeNull();
  expect(
    screen.getByText("Install the local AI engine to continue to AnkiBrain.")
  ).toBeInTheDocument();
});

test("gate on an unsupported platform explains and offers the mode selector", () => {
  store.dispatch(
    setLocalEngineStatus({
      status: "unsupported",
      reason: "Intel Macs are not supported for Local mode.",
    })
  );
  renderModal(true);

  expect(
    screen.getByText("Intel Macs are not supported for Local mode.")
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Choose a different mode" })
  ).toBeInTheDocument();
  expect(screen.queryByText("Cancel")).toBeNull();
});

test("gate with an absent engine opens the user-mode selector", () => {
  store.dispatch(setLocalEngineStatus({ status: "supported-but-absent" }));
  renderModal(true);

  fireEvent.click(
    screen.getByRole("button", { name: "Choose a different mode" })
  );

  expect(store.getState().userModeSelector.value).toBe(true);
});

test("gate during an active install hides Cancel", () => {
  store.dispatch(setLocalEngineStatus({ status: "supported-but-absent" }));
  store.dispatch(setLocalEngineInstallActive(true));
  renderModal(true);

  expect(screen.getByText("Preparing installer (uv)")).toBeInTheDocument();
  expect(screen.queryByText("Cancel")).toBeNull();
});

test("failure screen offers manual install instructions", () => {
  store.dispatch(
    setLocalEngineStatus({
      status: "supported-but-absent",
      platform: "windows-amd64",
    })
  );
  // setSetupModalOpen(true) clears a stale terminal result when nothing is
  // active, so the failure payload must be dispatched after it.
  store.dispatch(setSetupModalOpen(true));
  store.dispatch(
    setLocalEngineInstallDone({
      ok: false,
      error: { message: "uv archive layout unexpected (missing uv.exe)" },
    })
  );
  renderModal();

  expect(screen.getByText("Install failed")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Manual install instructions"));

  expect(screen.getByText(/uv python install/)).toBeInTheDocument();
});
