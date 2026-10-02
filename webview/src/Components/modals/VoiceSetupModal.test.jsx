import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "../../api/redux";
import {
  setSetupModalOpen,
  setTtsInstallActive,
  setTtsInstallEvent,
} from "../../api/redux/slices/tts";
import { VoiceSetupModal } from "./VoiceSetupModal";

// The store is a singleton; reset the install substate exactly like a fresh
// session (same convention as the slice tests).
beforeEach(() => {
  store.dispatch(setTtsInstallActive(true)); // clears event/stages/done
  store.dispatch(setTtsInstallActive(false));
  store.dispatch(setSetupModalOpen(false));
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
