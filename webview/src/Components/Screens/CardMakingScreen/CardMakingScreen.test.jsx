import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { store } from "../../../api/redux";
import { setCards } from "../../../api/redux/slices/cards";
import { addImages, clearImages } from "../../../api/redux/slices/imagesRegistry";
import {
  setMakeCardsText,
  clearStagedImages,
} from "../../../api/redux/slices/makeCardsText";
import { CardMakingScreen } from "./CardMakingScreen";

// The paste/auto-attach path touches the Python bridge in the real app; mock
// only that boundary so the component logic runs unmocked.
vi.mock("../../../api/cards", () => ({
  generateCards: vi.fn(),
}));

vi.mock("../../../api/occlusion", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    importImageFromClipboard: vi.fn(),
    importImagesFromFiles: vi.fn(),
    importImagePaths: vi.fn(),
  };
});

vi.mock("../../../api/documents", () => ({
  pickCardsSource: vi.fn(),
  splitSelectedDocument: vi.fn(),
}));

import { generateCards } from "../../../api/cards";
import {
  importImageFromClipboard,
  importImagePaths,
} from "../../../api/occlusion";
import { pickCardsSource, splitSelectedDocument } from "../../../api/documents";
import { clearStagedDocument } from "../../../api/redux/slices/stagedDocument";

// Chakra's useBreakpointValue probes window.matchMedia; jsdom has none.
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

function basicCards(n) {
  return Array.from({ length: n }, (_, i) => ({
    type: "basic",
    front: `Front ${i}`,
    back: `Back ${i}`,
    tags: [],
  }));
}

const cardTags = () => screen.getAllByText(/· basic/);

function renderScreen() {
  return render(
    <Provider store={store}>
      <ChakraProvider>
        <MemoryRouter>
          <CardMakingScreen />
        </MemoryRouter>
      </ChakraProvider>
    </Provider>
  );
}

beforeEach(() => {
  store.dispatch(setCards([]));
  store.dispatch(setMakeCardsText(""));
  store.dispatch(clearStagedImages());
  store.dispatch(clearImages());
  store.dispatch(clearStagedDocument());
  importImageFromClipboard.mockReset();
  importImagePaths.mockReset();
  generateCards.mockReset();
  pickCardsSource.mockReset();
  splitSelectedDocument.mockReset();
});

test("mounts only one page of a large list", () => {
  store.dispatch(setCards(basicCards(120)));
  renderScreen();

  expect(screen.getByText("Review & edit cards (120)")).toBeInTheDocument();
  expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  expect(cardTags()).toHaveLength(50);
});

test("Next and Last page through the remainder", () => {
  store.dispatch(setCards(basicCards(120)));
  renderScreen();

  fireEvent.click(screen.getByText("Next"));
  expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  expect(cardTags()).toHaveLength(50);
  expect(screen.getByText("51 · basic")).toBeInTheDocument();

  fireEvent.click(screen.getByText("Last"));
  expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
  expect(cardTags()).toHaveLength(20);
  expect(screen.getByText("101 · basic")).toBeInTheDocument();
});

test("clearing the list re-clamps to a single page", () => {
  store.dispatch(setCards(basicCards(120)));
  renderScreen();

  fireEvent.click(screen.getByText("Last"));
  expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

  act(() => {
    store.dispatch(setCards([]));
  });

  expect(screen.getByText("Review & edit cards (0)")).toBeInTheDocument();
  expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  expect(screen.queryByText(/· basic/)).not.toBeInTheDocument();
});

const STAGED_CAPTION = /will be added to the cards made from this text/;

function openTextView() {
  renderScreen();
  fireEvent.click(screen.getByText("From Text"));
  return screen.getByPlaceholderText(/copy-paste any information/);
}

// Shapes mirror real QtWebEngine paste events (see probes): a bare image/png
// clipboard yields no types/items at all; Qt's own image format yields a file
// item; text yields text/plain.
function fakeClipboard({ items = [], types = [], text = "", html = "" } = {}) {
  return {
    items,
    types,
    files: [],
    getData: (type) => {
      if (type === "text/plain") return text;
      if (type === "text/html") return html;
      return "";
    },
  };
}

const DESCRIPTOR = {
  id: "run/paste.png",
  url: "file:///x/paste.png",
  mediaType: "image/png",
};

test("pasting an image stages it and attaches it to the next text run", async () => {
  store.dispatch(addImages([DESCRIPTOR]));
  importImageFromClipboard.mockResolvedValue([DESCRIPTOR]);

  const textarea = openTextView();
  act(() => {
    store.dispatch(setMakeCardsText("some text"));
  });

  // Screenshot / "Copy image": QtWebEngine exposes no types, items or files.
  fireEvent.paste(textarea, { clipboardData: fakeClipboard() });

  expect(generateCards).not.toHaveBeenCalled();
  expect(await screen.findByText(STAGED_CAPTION)).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByText("Make Cards From Text"));
  });

  expect(generateCards).toHaveBeenCalledTimes(1);
  expect(generateCards.mock.calls[0][5]).toEqual({
    images: [{ id: "run/paste.png", anchorChunk: 0 }],
  });
  expect(screen.queryByText(STAGED_CAPTION)).not.toBeInTheDocument();
});

test("a clipboard image exposed as a file item is staged too", async () => {
  store.dispatch(addImages([DESCRIPTOR]));
  importImageFromClipboard.mockResolvedValue([DESCRIPTOR]);

  const textarea = openTextView();
  fireEvent.paste(textarea, {
    clipboardData: fakeClipboard({
      items: [{ kind: "file", type: "image/png" }],
      types: ["Files"],
    }),
  });

  expect(await screen.findByText(STAGED_CAPTION)).toBeInTheDocument();
});

test("a text paste is not intercepted", () => {
  const textarea = openTextView();

  fireEvent.paste(textarea, {
    clipboardData: fakeClipboard({
      items: [{ kind: "string", type: "text/plain" }],
      types: ["text/plain"],
      text: "hello",
    }),
  });

  expect(importImageFromClipboard).not.toHaveBeenCalled();
  expect(screen.queryByText(STAGED_CAPTION)).not.toBeInTheDocument();
});

test("loading a document stages its pages without generating", async () => {
  pickCardsSource.mockResolvedValue({
    documents: [
      { path: "/tmp/lecture.pdf", size: 1000, file_name_with_extension: "lecture.pdf" },
    ],
    images: [],
  });
  splitSelectedDocument.mockResolvedValue({
    chunks: ["alpha", "beta", "gamma"],
    chunkPages: [1, 2, 2],
    images: [],
    doc: { file_name_with_extension: "lecture.pdf" },
  });
  importImagePaths.mockResolvedValue([]);

  renderScreen();
  fireEvent.click(screen.getByText("Load Document..."));

  expect(await screen.findByText("Make Cards (2)")).toBeInTheDocument();
  expect(screen.getByText("Page 1")).toBeInTheDocument();
  expect(screen.getByText("Page 2")).toBeInTheDocument();
  expect(generateCards).not.toHaveBeenCalled();

  fireEvent.click(screen.getByLabelText("Include Page 1"));
  expect(screen.getByText("Make Cards (1)")).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByText("Make Cards (1)"));
  });

  await waitFor(() => expect(generateCards).toHaveBeenCalledTimes(1));
  const generatedText = generateCards.mock.calls[0][0];
  expect(generatedText).toContain("beta");
  expect(generatedText).not.toContain("alpha");
});
