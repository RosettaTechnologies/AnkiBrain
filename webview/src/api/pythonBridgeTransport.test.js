import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./toast", () => ({
  errorToast: vi.fn(),
  infoToast: vi.fn(),
  successToast: vi.fn(),
}));
import { asendPythonCommand, sendPythonCommand } from "./PythonBridge";
import { store } from "./redux";
import { setPyCommandLock } from "./redux/slices/pyCommandLock";

beforeEach(() => {
  store.dispatch(setPyCommandLock(false));
});

// _sendToPython's console.log is the transport: WebEnginePage intercepts the
// DATA_FROM_REACT prefix and hands the rest to ReactBridge. Masking apiKey
// there made python persist the literal token "[redacted]" as the API key, so
// the endpoint rejected every request while the UI reported "Saved".
function captureWire(fn) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  fn();
  const message = log.mock.calls
    .map((call) => String(call[0]))
    .find((line) => line.startsWith("DATA_FROM_REACT:"));
  log.mockRestore();
  expect(message).toBeTruthy();
  return JSON.parse(message.replace("DATA_FROM_REACT: ", ""));
}

test("sendPythonCommand puts the apiKey on the wire verbatim", () => {
  const payload = captureWire(() =>
    sendPythonCommand("SET_OPENAI_CONFIG", {
      apiKey: "sk-live-abc123",
      baseUrl: "https://api.openai.com/v1",
    })
  );

  expect(payload.cmd).toBe("SET_OPENAI_CONFIG");
  expect(payload.apiKey).toBe("sk-live-abc123");
  expect(payload.baseUrl).toBe("https://api.openai.com/v1");
});

test("asendPythonCommand puts the apiKey on the wire verbatim", () => {
  const payload = captureWire(() => {
    asendPythonCommand("TEST_OPENAI_CONNECTION", {
      apiKey: "sk-live-abc123",
      baseUrl: "https://opencode.ai/zen/go/v1",
    });
  });

  expect(payload.cmd).toBe("TEST_OPENAI_CONNECTION");
  expect(payload.apiKey).toBe("sk-live-abc123");
  expect(typeof payload.commandId).toBe("number");
});
