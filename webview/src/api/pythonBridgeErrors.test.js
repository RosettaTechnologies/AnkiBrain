import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./toast", () => ({
  errorToast: vi.fn(),
  infoToast: vi.fn(),
  successToast: vi.fn(),
}));
import { handlePythonDataReceived } from "./PythonBridge";
import { errorToast } from "./toast";
import { store } from "./redux";
import { setChatLoading } from "./redux/slices/chatLoading";

beforeEach(() => {
  errorToast.mockReset();
  store.dispatch(setChatLoading(false));
});

test("a fire-and-forget command that dies in python clears the chat spinner and shows the message", async () => {
  // Reproduces the reported hang: the LOCAL ask has no commandId, so nothing
  // else would ever settle it. Python answers the DID_ with a top-level error.
  store.dispatch(setChatLoading(true));

  await handlePythonDataReceived(
    {
      cmd: "DID_ASK_CONVERSATION_NO_DOCUMENTS",
      commandId: "",
      error: "The local AI engine is not running yet.",
    },
    store.dispatch,
    vi.fn()
  );

  expect(store.getState().chatLoading.value).toBe(false);
  expect(errorToast).toHaveBeenCalledTimes(1);
  expect(String(errorToast.mock.calls[0][1])).toContain("not running yet");
});

test("a promise-tracked TTS sentinel error keeps its own handling (no generic toast)", async () => {
  // DID_SYNTHESIZE_SPEECH rejects with stable sentinels that the sender maps to
  // the setup modal. The early-out must not add a generic toast on top.
  await handlePythonDataReceived(
    {
      cmd: "DID_SYNTHESIZE_SPEECH",
      commandId: 42,
      error: "TTS_NOT_INSTALLED",
    },
    store.dispatch,
    vi.fn()
  );

  expect(errorToast).not.toHaveBeenCalled();
});

test("a push event carrying a top-level error is untouched", async () => {
  await handlePythonDataReceived(
    {
      cmd: "localEngineStartFailed",
      error: "boom",
    },
    store.dispatch,
    vi.fn()
  );

  // Its own handler toasts; the early-out must not double up.
  expect(errorToast).toHaveBeenCalledTimes(1);
  expect(errorToast.mock.calls[0][0]).toBe("Local Engine Error");
});
