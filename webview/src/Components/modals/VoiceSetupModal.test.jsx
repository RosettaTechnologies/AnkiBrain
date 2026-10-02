import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "../../api/redux";
import {
  setSetupModalMode,
  setSetupModalOpen,
  setTtsInstallActive,
  setTtsInstallEvent,
  setTtsStatus,
} from "../../api/redux/slices/tts";
import { VoiceSetupModal } from "./VoiceSetupModal";
import {
  pyTtsCancelInstall,
  pyTtsInstall,
} from "../../api/PythonBridge/senders/pyTtsInstall";

// The component's python senders are fire-and-forget; mock them so tests can
// assert the exact groups / cancel payload without a live bridge.
vi.mock("../../api/PythonBridge/senders/pyTtsInstall", () => ({
  pyTtsInstall: vi.fn(),
  pyTtsCancelInstall: vi.fn(),
}));

// The store is a singleton; reset the install substate exactly like a fresh
// session (same convention as the slice tests).
beforeEach(() => {
  vi.clearAllMocks();
  store.dispatch(setTtsInstallActive(true)); // clears event/stages/done
  store.dispatch(setTtsInstallActive(false));
  store.dispatch(setSetupModalOpen(false));
  store.dispatch(setSetupModalMode("default"));
  store.dispatch(setTtsStatus(null));
});

function renderModal() {
  return render(
    <Provider store={store}>
      <ChakraProvider>
        <VoiceSetupModal />
      </ChakraProvider>
    </Provider>
  );
}

test("renders the full checklist, in order, as empty checkboxes", () => {
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  const items = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(items).toEqual([
    "☐Preparing installer (uv)",
    "☐Installing Python runtime",
    "☐Creating voice environment",
    "☐Installing engine packages (PyTorch)",
    "☐Installing English tokenizer",
    "☐Fetching Kokoro-82M voice model",
    "☐Verifying synthesis",
  ]);
});

test("checks steps off as their stage events arrive", () => {
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(setSetupModalOpen(true));
  store.dispatch(setTtsInstallEvent({ stage: "uv", status: "done", message: "uv ready" }));
  store.dispatch(
    setTtsInstallEvent({ stage: "python", status: "start", message: "Installing CPython 3.11" })
  );
  renderModal();

  // One checkmark, one active row, the rest still to-do.
  expect(screen.getAllByText("✓")).toHaveLength(1);
  expect(screen.getAllByText("☐")).toHaveLength(5);
  // The heading shows the current step's message, never a stale stage.
  expect(screen.getByText("Installing CPython 3.11")).toBeInTheDocument();
});

test("shows the Japanese step only when it was requested", () => {
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  expect(screen.queryByText("Installing Japanese voice pack")).toBeNull();

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByText("Install voice engine"));

  expect(screen.getByText("Installing Japanese voice pack")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(8);
});

test("add_ja mode offers an incremental Japanese pack install", () => {
  store.dispatch(setSetupModalMode("add_ja"));
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  expect(
    screen.getByText(
      "Add the Japanese language pack to the installed voice engine."
    )
  ).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).toBeNull();

  fireEvent.click(screen.getByText("Install Japanese pack"));

  expect(pyTtsInstall).toHaveBeenCalledWith(["ja"]);
  const items = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(items).toEqual([
    "☐Installing Japanese voice pack",
    "☐Verifying Japanese synthesis",
  ]);
});

test("add_ja cancel preserves the installed core engine", async () => {
  pyTtsCancelInstall.mockResolvedValue({ ok: true });
  store.dispatch(setSetupModalMode("add_ja"));
  store.dispatch(setSetupModalOpen(true));
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(
    setTtsInstallEvent({ stage: "ja", status: "start", message: "Installing…" })
  );
  renderModal();

  fireEvent.click(screen.getByText("Cancel"));

  await waitFor(() =>
    expect(pyTtsCancelInstall).toHaveBeenCalledWith({ preserveCore: true })
  );
});

test("repair prompt pre-checks Japanese when the pack is installed", () => {
  store.dispatch(
    setTtsStatus({ status: "supported-and-installed", ja_pack: true })
  );
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  expect(screen.getByRole("checkbox")).toBeChecked();
});
