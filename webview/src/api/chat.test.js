import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./user", () => ({ isLocalMode: vi.fn() }));
vi.mock("./server-api/chat", () => ({ sendUserMessageToServer: vi.fn() }));
vi.mock("./PythonBridge/senders/pyAskAIConversation", () => ({
  pyAskAIConversation: vi.fn(),
}));
vi.mock("./toast", () => ({
  errorToast: vi.fn(),
  infoToast: vi.fn(),
  successToast: vi.fn(),
}));

import { sendUserMessage } from "./chat";
import { isLocalMode } from "./user";
import { sendUserMessageToServer } from "./server-api/chat";
import { pyAskAIConversation } from "./PythonBridge/senders/pyAskAIConversation";
import { errorToast } from "./toast";
import { setCurrentChatInput, setUser, store } from "./redux";
import { setChatLoading } from "./redux/slices/chatLoading";
import { clearMessages } from "./redux/slices/messagesSlice";

beforeEach(() => {
  vi.clearAllMocks();
  store.dispatch(setChatLoading(false));
  store.dispatch(clearMessages());
  store.dispatch(setCurrentChatInput("draft"));
  store.dispatch(setUser({ accessToken: "token-1" }));
});

test("a failed server send clears the spinner and reports it", async () => {
  isLocalMode.mockReturnValue(false);
  sendUserMessageToServer.mockRejectedValue(new Error("network down"));

  await sendUserMessage("hello");

  expect(store.getState().chatLoading.value).toBe(false);
  expect(errorToast).toHaveBeenCalledWith("Chat Error", "network down");
  // The draft was accepted, so the input was cleared.
  expect(store.getState().currentChatInput.value).toBe("");
});

test("a refused local send keeps the draft and raises no spinner", async () => {
  isLocalMode.mockReturnValue(true);
  pyAskAIConversation.mockReturnValue(false);

  await sendUserMessage("hello");

  expect(pyAskAIConversation).toHaveBeenCalledWith("hello", false);
  expect(store.getState().chatLoading.value).toBe(false);
  expect(store.getState().currentChatInput.value).toBe("draft");
  expect(store.getState().messages.value).toEqual([]);
});

test("an accepted local send parks the spinner until python replies", async () => {
  isLocalMode.mockReturnValue(true);
  pyAskAIConversation.mockReturnValue(true);

  await sendUserMessage("hello");

  expect(store.getState().chatLoading.value).toBe(true);
  expect(store.getState().currentChatInput.value).toBe("");
  expect(store.getState().messages.value).toEqual([
    { type: "user", text: "hello" },
  ]);
});
