import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../toast", () => ({
  errorToast: vi.fn(),
  infoToast: vi.fn(),
  successToast: vi.fn(),
}));
vi.mock("../tts", () => ({
  openSetupModal: vi.fn(),
  refreshTtsStatus: vi.fn(),
  speak: vi.fn(),
}));
vi.mock("../localEngine", () => ({
  openLocalEngineModal: vi.fn(),
  refreshLocalEngineStatus: vi.fn(),
}));
vi.mock("./senders/pyLocalEngine", () => ({
  pyLocalEngineInstall: vi.fn(),
  pyLocalEngineUninstall: vi.fn(),
  pyLocalEngineResetData: vi.fn(),
}));

import { initPythonBridge, handlePythonDataReceived } from "./index";
import { InterprocessCommand as IC } from "./InterprocessCommand";
import { store } from "../redux";
import { setChatLoading } from "../redux/slices/chatLoading";
import { clearMessages } from "../redux/slices/messagesSlice";
import { errorToast } from "../toast";

beforeEach(() => {
  store.dispatch(clearMessages());
  store.dispatch(setChatLoading(false));
  vi.clearAllMocks();
});

// python's reply for the talk screen: the endpoint's answer, plus the cost the
// subprocess always attaches. A throw anywhere in the switchboard used to be an
// unhandled rejection, so these two assertions are the anti-hang guard.
test("a talk reply clears the send spinner and appends the answer", async () => {
  store.dispatch(setChatLoading(true));
  await handlePythonDataReceived(
    {
      cmd: IC.DID_ASK_CONVERSATION_NO_DOCUMENTS,
      data: { response: "Hi, nice friend!", total_cost: 0 },
      commandId: "",
    },
    store.dispatch,
    vi.fn()
  );

  expect(store.getState().chatLoading.value).toBe(false);
  expect(store.getState().messages.value).toEqual([
    {
      type: "ai",
      text: "Hi, nice friend!",
      sourceSnippets: [],
      model: store.getState().appSettings.ai.llmModel,
      temperature: store.getState().appSettings.ai.temperature,
    },
  ]);
});

test("a documents reply clears the spinner and carries its source snippets", async () => {
  store.dispatch(setChatLoading(true));
  await handlePythonDataReceived(
    {
      cmd: IC.DID_ASK_CONVERSATION_DOCUMENTS,
      data: {
        response: "Chlorophyll absorbs light.",
        source_documents: JSON.stringify([
          { page_content: "Plants photosynthesize." },
        ]),
      },
      commandId: "",
    },
    store.dispatch,
    vi.fn()
  );

  expect(store.getState().chatLoading.value).toBe(false);
  expect(store.getState().messages.value[0].sourceSnippets).toEqual([
    "Plants photosynthesize.",
  ]);
});

// The transport entrypoint must settle a broken reply instead of leaving the
// spinner up forever: receiveFromPython does not await the switchboard.
test("a reply the switchboard cannot process clears the spinners and reports it", async () => {
  const window = { receiveFromPython: null };
  initPythonBridge(window, store.dispatch, vi.fn());
  store.dispatch(setChatLoading(true));

  window.receiveFromPython({
    cmd: IC.DID_ASK_CONVERSATION_DOCUMENTS,
    data: { response: "x", source_documents: "not json" },
    commandId: "",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(store.getState().chatLoading.value).toBe(false);
  expect(errorToast).toHaveBeenCalled();
});
