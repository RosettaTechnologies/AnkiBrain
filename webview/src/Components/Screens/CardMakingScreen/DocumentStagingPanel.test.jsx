import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { vi } from "vitest";
import { store } from "../../../api/redux";
import { setStagedDocument } from "../../../api/redux/slices/stagedDocument";
import { buildStagedDocument } from "../../../api/documentStaging";
import { DocumentStagingPanel } from "./DocumentStagingPanel";

function stagedThreeSections() {
  return buildStagedDocument({
    chunks: ["alpha one", "beta two", "gamma three"],
    chunkPages: null,
    images: [],
    doc: { file_name_with_extension: "notes.txt" },
  });
}

function renderPanel(props = {}) {
  const onGenerate = props.onGenerate || vi.fn();
  const onClear = props.onClear || vi.fn();
  render(
    <Provider store={store}>
      <ChakraProvider>
        <DocumentStagingPanel
          cardType={props.cardType || "basic"}
          imagesById={{}}
          onGenerate={onGenerate}
          onClear={onClear}
        />
      </ChakraProvider>
    </Provider>
  );
  return { onGenerate, onClear };
}

beforeEach(() => {
  store.dispatch(setStagedDocument(stagedThreeSections()));
});

test("counts included pages and updates it when a page is excluded", () => {
  renderPanel();
  expect(screen.getByText(/3 sections/)).toBeInTheDocument();
  expect(screen.getByText("Make Cards (3)")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Include Section 2"));

  expect(screen.getByText("Make Cards (2)")).toBeInTheDocument();
});

test("Make Cards calls onGenerate when content is included", () => {
  const { onGenerate } = renderPanel();
  fireEvent.click(screen.getByText("Make Cards (3)"));
  expect(onGenerate).toHaveBeenCalledTimes(1);
});

test("bulk None disables Make Cards for text cards", () => {
  renderPanel();
  fireEvent.click(screen.getByText("None"));

  expect(screen.getByText("Make Cards (0)")).toBeDisabled();
});

test("renders nothing when no document is staged", () => {
  store.dispatch(
    setStagedDocument({
      docName: "",
      runId: "",
      looseImageIds: [],
      entries: [],
      images: [],
    })
  );
  const { container } = render(
    <Provider store={store}>
      <ChakraProvider>
        <DocumentStagingPanel onGenerate={vi.fn()} onClear={vi.fn()} />
      </ChakraProvider>
    </Provider>
  );
  expect(container.textContent).toBe("");
});
