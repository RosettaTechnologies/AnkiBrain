import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "../../../api/redux";
import {
  setLLMModel,
  setOpenAIModels,
  setOpenAITestResult,
} from "../../../api/redux/slices/appSettings";
import { OpenAISettings } from "./SettingsScreen";
import { pyTestOpenAIConnection } from "../../../api/PythonBridge/senders/pyOpenAIConfig";
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
