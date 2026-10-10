import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "../../../api/redux";
import {
  setHasOpenaiApiKey,
  setLLMModel,
  setOpenAIBaseUrl,
  setOpenAIModels,
  setOpenAITestResult,
} from "../../../api/redux/slices/appSettings";
import { localConfigGate } from "../../../api/localConfig";
import { OpenAISettings } from "./SettingsScreen";
import {
  pySetOpenAIConfig,
  pyTestOpenAIConnection,
} from "../../../api/PythonBridge/senders/pyOpenAIConfig";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";

// Both senders are mocked: the test path awaits pyEditSetting, and without a
// mock it would await a bridge promise that never settles in jsdom.
vi.mock("../../../api/PythonBridge/senders/pyOpenAIConfig", () => ({
  pyTestOpenAIConnection: vi.fn(),
  pySetOpenAIConfig: vi.fn(),
}));
vi.mock("../../../api/PythonBridge/senders/pyEditSetting", () => ({
  pyEditSetting: vi.fn(async () => ({ ok: true })),
}));

const renderSection = () =>
  render(
    <ChakraProvider>
      <Provider store={store}>
        <OpenAISettings />
      </Provider>
    </ChakraProvider>
  );

const clickTest = async (apiKey = "") => {
  if (apiKey) {
    fireEvent.change(screen.getByPlaceholderText("sk-..."), {
      target: { value: apiKey },
    });
  }
  fireEvent.click(screen.getByText("Test connection"));
  await waitFor(() => expect(pyTestOpenAIConnection).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.queryByText("Test connection")).toBeInTheDocument()
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  store.dispatch(setOpenAIModels([]));
  store.dispatch(setLLMModel("gpt-5.6-luna"));
  store.dispatch(setOpenAITestResult(null));
  store.dispatch(setOpenAIBaseUrl(""));
  store.dispatch(setHasOpenaiApiKey(false));
});

test("a reachable endpoint refreshes the model list and accepts the key", async () => {
  pyTestOpenAIConnection.mockResolvedValue({
    ok: true,
    status: 200,
    url_message: "Reachable (HTTP 200) - 2 models listed.",
    models: ["a-model", "z-model"],
    key: {
      status: "accepted",
      message: "The endpoint returned its model list with this key.",
    },
  });
  renderSection();
  await clickTest("sk-test");
  expect(pyTestOpenAIConnection).toHaveBeenCalledWith({
    apiKey: "sk-test",
    baseUrl: null,
    extraHeaders: {},
  });
  await waitFor(() =>
    expect(
      screen.getByText(/Reachable \(HTTP 200\) - 2 models listed\./)
    ).toBeInTheDocument()
  );
  expect(
    screen.getByText(/The endpoint returned its model list with this key\./)
  ).toBeInTheDocument();
  expect(pyEditSetting).toHaveBeenCalledWith("openaiModels", [
    "a-model",
    "z-model",
  ]);
  expect(store.getState().appSettings.ai.openaiModels).toEqual([
    "a-model",
    "z-model",
  ]);
});

test("a rejected key clears a stale model list", async () => {
  store.dispatch(setOpenAIModels(["stale-model"]));
  pyTestOpenAIConnection.mockResolvedValue({
    ok: true,
    status: 401,
    url_message: "Reachable (HTTP 401) - the endpoint requires an API key.",
    models: [],
    key: { status: "rejected", message: "Incorrect API key provided." },
  });
  renderSection();
  await clickTest("sk-bad");
  await waitFor(() =>
    expect(screen.getByText(/Incorrect API key provided\./)).toBeInTheDocument()
  );
  expect(
    screen.getByText(/Reachable \(HTTP 401\) - the endpoint requires an API key\./)
  ).toBeInTheDocument();
  expect(pyEditSetting).toHaveBeenCalledWith("openaiModels", []);
  expect(store.getState().appSettings.ai.openaiModels).toEqual([]);
});

test("an unreachable URL is reported without testing the key", async () => {
  pyTestOpenAIConnection.mockResolvedValue({
    ok: false,
    status: null,
    url_message:
      "Could not reach https://nope.invalid/v1/models: All connection attempts failed",
    models: [],
    key: {
      status: "not-attempted",
      message: "Not tested - the URL did not answer.",
    },
  });
  renderSection();
  await clickTest();
  await waitFor(() =>
    expect(
      screen.getByText(/Could not reach https:\/\/nope\.invalid/)
    ).toBeInTheDocument()
  );
  expect(
    screen.getByText(/Not tested - the URL did not answer\./)
  ).toBeInTheDocument();
});

test("a free-text model is persisted when the endpoint lists none", async () => {
  renderSection();
  fireEvent.change(screen.getByPlaceholderText("gpt-5.6-luna"), {
    target: { value: "my-gateway-alias" },
  });
  fireEvent.blur(screen.getByPlaceholderText("gpt-5.6-luna"));
  await waitFor(() =>
    expect(pyEditSetting).toHaveBeenCalledWith("llmModel", "my-gateway-alias")
  );
  expect(store.getState().appSettings.ai.llmModel).toBe("my-gateway-alias");
});

test("the model dropdown lists the endpoint's models after a successful test", async () => {
  pyTestOpenAIConnection.mockResolvedValue({
    ok: true,
    status: 200,
    url_message: "Reachable (HTTP 200) - 2 models listed.",
    models: ["a-model", "z-model"],
    key: {
      status: "accepted",
      message: "The endpoint returned its model list with this key.",
    },
  });
  renderSection();
  await clickTest("sk-test");
  fireEvent.click(screen.getByLabelText("Show models"));
  const options = await within(screen.getByRole("listbox")).findAllByRole(
    "option"
  );
  expect(options.map((o) => o.textContent)).toEqual(["a-model", "z-model"]);
  fireEvent.click(screen.getByText("z-model"));
  await waitFor(() =>
    expect(pyEditSetting).toHaveBeenCalledWith("llmModel", "z-model")
  );
  expect(store.getState().appSettings.ai.llmModel).toBe("z-model");
  // The popover dismisses through a Chakra transition, so a bare assertion
  // here races under a loaded full-suite run.
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  );
});

test("the model dropdown offers nothing before a successful test", () => {
  renderSection();
  fireEvent.click(screen.getByLabelText("Show models"));
  expect(
    within(screen.getByRole("listbox")).queryAllByRole("option")
  ).toHaveLength(0);
  expect(screen.getByText(/No models listed yet/)).toBeInTheDocument();
});

test("typing filters the listed models", async () => {
  store.dispatch(setOpenAIModels(["a-model", "z-model"]));
  renderSection();
  fireEvent.change(screen.getByPlaceholderText("gpt-5.6-luna"), {
    target: { value: "z" },
  });
  const options = await within(screen.getByRole("listbox")).findAllByRole(
    "option"
  );
  expect(options.map((o) => o.textContent)).toEqual(["z-model"]);
});

test("a successful test persists the endpoint/key verdict", async () => {
  pyTestOpenAIConnection.mockResolvedValue({
    ok: true,
    status: 200,
    url_message: "Reachable (HTTP 200) - 2 models listed.",
    models: ["a-model", "z-model"],
    key: {
      status: "accepted",
      message: "The endpoint returned its model list with this key.",
    },
  });
  renderSection();
  await clickTest("sk-test");
  await waitFor(() =>
    expect(pyEditSetting).toHaveBeenCalledWith("openaiVerifiedUrl", "")
  );
  expect(pyEditSetting).toHaveBeenCalledWith("openaiKeyStatus", "accepted");
  expect(pyEditSetting).toHaveBeenCalledWith(
    "openaiKeyStatusMessage",
    "The endpoint returned its model list with this key."
  );
  expect(pyEditSetting).toHaveBeenCalledWith(
    "openaiUrlStatusMessage",
    "Reachable (HTTP 200) - 2 models listed."
  );
});

test("a stored verdict renders without re-testing", () => {
  store.dispatch(
    setOpenAITestResult({
      ok: true,
      baseUrl: "",
      urlMessage: "Reachable (HTTP 200) - 2 models listed.",
      key: { status: "accepted", message: "Key accepted." },
    })
  );
  renderSection();
  expect(screen.getByText(/Reachable \(HTTP 200\)/)).toBeInTheDocument();
  expect(screen.getByText(/accepted/)).toBeInTheDocument();
});

test("a tested endpoint saved afterwards keeps its verdict", async () => {
  pyTestOpenAIConnection.mockResolvedValue({
    ok: true,
    status: 200,
    url_message: "Reachable (HTTP 200) - 1 models listed.",
    models: ["gateway-model"],
    key: { status: "accepted", message: "Key accepted." },
  });
  pySetOpenAIConfig.mockResolvedValue({ ok: true });
  renderSection();
  fireEvent.change(screen.getByPlaceholderText("https://api.openai.com/v1"), {
    target: { value: "https://gateway.example/v1" },
  });
  await clickTest("sk-test");
  await screen.findByText(/Reachable \(HTTP 200\) - 1 models listed\./);
  // An unsaved URL stays out of settings.json while it is only a draft...
  expect(pyEditSetting).not.toHaveBeenCalledWith(
    "openaiVerifiedUrl",
    "https://gateway.example/v1"
  );

  fireEvent.click(screen.getByText("Save"));
  // ...and the save adopts the draft's successful test as the saved
  // endpoint's verdict, models included, so a restart restores it instead of
  // asking for another Test connection.
  await waitFor(() =>
    expect(pyEditSetting).toHaveBeenCalledWith(
      "openaiVerifiedUrl",
      "https://gateway.example/v1"
    )
  );
  // The gate assertion also waits for the save's key/model bookkeeping, which
  // runs after the verdict writes.
  await waitFor(() =>
    expect(
      localConfigGate("LOCAL", store.getState().appSettings.ai)
    ).toMatchObject({ ok: true })
  );
  expect(pyEditSetting).toHaveBeenCalledWith("openaiModels", [
    "gateway-model",
  ]);
  const ai = store.getState().appSettings.ai;
  expect(ai.openaiBaseUrl).toBe("https://gateway.example/v1");
  expect(ai.openaiTestResult).toMatchObject({
    ok: true,
    baseUrl: "https://gateway.example/v1",
  });
});

test("a failed test of an unsaved URL leaves the saved endpoint verified", async () => {
  store.dispatch(setOpenAIBaseUrl("https://saved.example/v1"));
  store.dispatch(setHasOpenaiApiKey(true));
  store.dispatch(
    setOpenAITestResult({
      ok: true,
      baseUrl: "https://saved.example/v1",
      urlMessage: "Reachable (HTTP 200) - 1 models listed.",
      key: { status: "accepted", message: "Key accepted." },
    })
  );
  pyTestOpenAIConnection.mockResolvedValue({
    ok: false,
    status: null,
    url_message:
      "Could not reach https://draft.example/v1/models: All connection attempts failed",
    models: [],
    key: {
      status: "not-attempted",
      message: "Not tested - the URL did not answer.",
    },
  });
  renderSection();
  fireEvent.change(screen.getByPlaceholderText("https://api.openai.com/v1"), {
    target: { value: "https://draft.example/v1" },
  });
  await clickTest();
  await screen.findByText(/Could not reach https:\/\/draft\.example/);
  // The draft's failure is session-only: the saved endpoint's verdict is
  // untouched, so the AI still runs after a restart.
  expect(pyEditSetting).not.toHaveBeenCalledWith("openaiVerifiedUrl", null);
  expect(pyEditSetting).not.toHaveBeenCalledWith(
    "openaiVerifiedUrl",
    "https://draft.example/v1"
  );
  const ai = store.getState().appSettings.ai;
  expect(ai.openaiTestResult).toMatchObject({
    ok: true,
    baseUrl: "https://saved.example/v1",
  });
  expect(localConfigGate("LOCAL", ai)).toMatchObject({ ok: true });
});

test("saving a different URL drops the stored verdict of the old endpoint", async () => {
  store.dispatch(setOpenAIBaseUrl("https://old.example/v1"));
  store.dispatch(setHasOpenaiApiKey(true));
  store.dispatch(
    setOpenAITestResult({
      ok: true,
      baseUrl: "https://old.example/v1",
      urlMessage: "Reachable (HTTP 200) - 1 models listed.",
      key: { status: "accepted", message: "Key accepted." },
    })
  );
  pySetOpenAIConfig.mockResolvedValue({ ok: true });
  renderSection();
  fireEvent.change(screen.getByPlaceholderText("https://api.openai.com/v1"), {
    target: { value: "https://new.example/v1" },
  });
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() =>
    expect(pyEditSetting).toHaveBeenCalledWith("openaiVerifiedUrl", null)
  );
  const ai = store.getState().appSettings.ai;
  expect(ai.openaiBaseUrl).toBe("https://new.example/v1");
  expect(ai.openaiTestResult).toBeNull();
  expect(localConfigGate("LOCAL", ai).ok).toBe(false);
});

test("testing with a blank URL field verifies the saved endpoint", async () => {
  store.dispatch(setOpenAIBaseUrl("https://saved.example/v1"));
  store.dispatch(setHasOpenaiApiKey(true));
  pyTestOpenAIConnection.mockResolvedValue({
    ok: true,
    status: 200,
    url_message: "Reachable (HTTP 200) - 1 models listed.",
    models: ["saved-model"],
    key: { status: "accepted", message: "Key accepted." },
  });
  renderSection();
  fireEvent.change(screen.getByPlaceholderText("https://api.openai.com/v1"), {
    target: { value: "" },
  });
  await clickTest();
  await waitFor(() =>
    expect(pyTestOpenAIConnection).toHaveBeenCalledWith({
      apiKey: null,
      baseUrl: null,
      extraHeaders: {},
    })
  );
  // Python falls back to the saved URL for a blank field, so that is the URL
  // the verdict (and a restart) must name.
  await waitFor(() =>
    expect(pyEditSetting).toHaveBeenCalledWith(
      "openaiVerifiedUrl",
      "https://saved.example/v1"
    )
  );
  expect(localConfigGate("LOCAL", store.getState().appSettings.ai)).toMatchObject(
    { ok: true }
  );
});
