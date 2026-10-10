import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "../../api/redux";
import {
  dismissErrorDialog,
  pushErrorDialog,
} from "../../api/redux/slices/errorDialog";
import { ErrorDialog } from "./ErrorDialog";

// Redux dispatches are wrapped in act(): the modal re-renders straight from
// the store, and an un-acted dispatch would assert before the DOM updates.
const push = (payload) =>
  act(() => {
    store.dispatch(pushErrorDialog(payload));
  });

const click = (label) =>
  act(() => {
    fireEvent.click(screen.getByText(label));
  });

beforeEach(() => {
  act(() => {
    while (store.getState().errorDialog.value.current) {
      store.dispatch(dismissErrorDialog());
    }
  });
});

function renderDialog() {
  return render(
    <ChakraProvider>
      <Provider store={store}>
        <ErrorDialog />
      </Provider>
    </ChakraProvider>
  );
}

test("an error is readable in the dialog and Next advances the queue", () => {
  renderDialog();
  expect(screen.queryByText("Chat Error")).not.toBeInTheDocument();

  push({ title: "Chat Error", message: "the long message" });
  expect(screen.getByText("Chat Error")).toBeInTheDocument();
  expect(screen.getByText("the long message")).toBeInTheDocument();

  push({ title: "Second Error", message: "another message" });
  expect(screen.getByText("+1 more waiting")).toBeInTheDocument();

  click("Next");

  expect(screen.getByText("Second Error")).toBeInTheDocument();
  expect(screen.getByText("another message")).toBeInTheDocument();
  expect(screen.queryByText("Chat Error")).not.toBeInTheDocument();

  // Last one: the button reads Close and dismissing empties the queue (the
  // modal itself lingers through its exit animation, so assert the state).
  click("Close");
  expect(store.getState().errorDialog.value).toEqual({
    current: null,
    queue: [],
    nextId: 3,
  });
});
