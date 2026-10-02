import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { IonApp, setupIonicReact } from "@ionic/react";
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

setupIonicReact({ mode: "md" });

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
    <IonApp>
      <Provider store={store}>
        <VoiceSetupModal />
      </Provider>
    </IonApp>
  );
}

// Ionic modals present asynchronously and portal their content to <body>;
// Ionic form controls only respond to interaction once their web component
// has hydrated.
async function waitForHydratedCheckbox() {
  await waitFor(
    () => expect(document.querySelector("ion-checkbox")).toBeTruthy(),
    { timeout: 5000 }
  );
  const checkbox = document.querySelector("ion-checkbox");
  await waitFor(() => expect(checkbox.classList.contains("hydrated")).toBe(true), {
    timeout: 8000,
  });
  return checkbox;
}

test("renders the full checklist, in order, as empty checkboxes", async () => {
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  const items = (await screen.findAllByRole("listitem")).map(
    (li) => li.textContent
  );
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

test("checks steps off as their stage events arrive", async () => {
  store.dispatch(setTtsInstallActive(true));
  store.dispatch(setSetupModalOpen(true));
  store.dispatch(setTtsInstallEvent({ stage: "uv", status: "done", message: "uv ready" }));
  store.dispatch(
    setTtsInstallEvent({ stage: "python", status: "start", message: "Installing CPython 3.11" })
  );
  renderModal();

  // The heading shows the current step's message, never a stale stage.
  expect(
    await screen.findByText("Installing CPython 3.11")
  ).toBeInTheDocument();
  // One checkmark, one active row, the rest still to-do.
  expect(screen.getAllByText("✓")).toHaveLength(1);
  expect(screen.getAllByText("☐")).toHaveLength(5);
});

test("shows the Japanese step only when it was requested", async () => {
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  await screen.findByText("Install voice engine");
  expect(screen.queryByText("Installing Japanese voice pack")).toBeNull();

  // jsdom cannot reproduce Ionic's internal checkbox -> ionChange path (no
  // hit-testing into shadow DOM), so dispatch the event the component
  // listens to; the real browser path is covered by manual QA.
  const checkbox = await waitForHydratedCheckbox();
  fireEvent(
    checkbox,
    new CustomEvent("ionChange", { detail: { checked: true } })
  );

  fireEvent.click(screen.getByText("Install voice engine"));

  expect(
    await screen.findByText("Installing Japanese voice pack")
  ).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(8));
});

test("add_ja mode offers an incremental Japanese pack install", async () => {
  store.dispatch(setSetupModalMode("add_ja"));
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  expect(
    await screen.findByText(
      "Add the Japanese language pack to the installed voice engine."
    )
  ).toBeInTheDocument();
  expect(document.querySelector("ion-checkbox")).toBeNull();

  fireEvent.click(screen.getByText("Install Japanese pack"));

  expect(pyTtsInstall).toHaveBeenCalledWith(["ja"]);
  const items = (await screen.findAllByRole("listitem")).map(
    (li) => li.textContent
  );
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

  fireEvent.click(await screen.findByText("Cancel"));

  await waitFor(() =>
    expect(pyTtsCancelInstall).toHaveBeenCalledWith({ preserveCore: true })
  );
});

test("repair prompt pre-checks Japanese when the pack is installed", async () => {
  store.dispatch(
    setTtsStatus({ status: "supported-and-installed", ja_pack: true })
  );
  store.dispatch(setSetupModalOpen(true));
  renderModal();

  // The pre-checked box means a repair installs core + ja in one run; assert
  // the payload the button actually sends.
  fireEvent.click(await screen.findByText("Repair voice engine"));

  expect(pyTtsInstall).toHaveBeenCalledWith(["core", "ja"]);
});
