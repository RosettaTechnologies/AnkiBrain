import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "../../../api/redux";
import { setCards } from "../../../api/redux/slices/cards";
import { CardMakingScreen } from "./CardMakingScreen";

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
