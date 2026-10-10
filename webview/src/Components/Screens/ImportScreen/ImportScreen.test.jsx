import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "../../../api/redux";
import { setUser } from "../../../api/redux";
import { setDocuments } from "../../../api/redux/slices/documentsSlice";
import { ImportScreen } from "./ImportScreen";

// The Import screen only reads the store and calls these two on click; mocking
// the module keeps the bridge/network imports out of jsdom.
vi.mock("../../../api/documents", () => ({
  importDocuments: vi.fn(),
  deleteAllDocuments: vi.fn(),
}));
vi.mock("../../../api/user", () => ({ isLocalMode: vi.fn() }));
vi.mock("../../../api/toast", () => ({
  errorToast: vi.fn(),
  infoToast: vi.fn(),
  successToast: vi.fn(),
}));

import { isLocalMode } from "../../../api/user";

const LOCAL_DOC = {
  file_name: "respiration_test_doc",
  file_name_with_extension: "respiration_test_doc.pdf",
  extension: ".pdf",
  path: "/home/elan/Documents/respiration_test_doc.pdf",
  size: 82325,
};

const renderScreen = () =>
  render(
    <ChakraProvider>
      <Provider store={store}>
        <ImportScreen />
      </Provider>
    </ChakraProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  store.dispatch(setDocuments([]));
  store.dispatch(setUser(null));
});

test("local mode lists documents imported into the documents slice", () => {
  // LOCAL mode has no account object; documents_saved (hydrated into this
  // slice by DID_LOAD_SETTINGS) and the post-import append are the only list.
  isLocalMode.mockReturnValue(true);
  store.dispatch(setDocuments([LOCAL_DOC]));

  renderScreen();

  expect(screen.getByText("respiration_test_doc.pdf")).toBeInTheDocument();
  expect(
    screen.getByText("/home/elan/Documents/respiration_test_doc.pdf")
  ).toBeInTheDocument();
  expect(screen.getByText("0.08 MB")).toBeInTheDocument();
  expect(screen.getByText("Delete Documents").closest("button")).toBeEnabled();
});

test("local mode with no documents disables Delete Documents", () => {
  isLocalMode.mockReturnValue(true);

  renderScreen();

  expect(
    screen.getByText("Delete Documents").closest("button")
  ).toBeDisabled();
});

test("server mode still lists the account's stored documents", () => {
  isLocalMode.mockReturnValue(false);
  store.dispatch(setUser({ documentsStored: [LOCAL_DOC] }));

  renderScreen();

  expect(screen.getByText("respiration_test_doc.pdf")).toBeInTheDocument();
});
