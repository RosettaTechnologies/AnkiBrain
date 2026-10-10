import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { setUser, store } from "../../api/redux";
import { deleteAccount } from "../../api/user";
import { DeleteAccountModal } from "./DeleteAccountModal";

// deleteAccount reaches the account API through the python bridge in
// production; mock it so the modal can be driven without a live account.
vi.mock("../../api/user", () => ({ deleteAccount: vi.fn() }));

function renderModal(onClose = () => {}) {
  return render(
    <Provider store={store}>
      <ChakraProvider>
        <DeleteAccountModal isOpen onClose={onClose} />
      </ChakraProvider>
    </Provider>
  );
}

const confirmButton = () =>
  screen.getByRole("button", { name: "Delete Account" });

beforeEach(() => {
  vi.clearAllMocks();
  store.dispatch(
    setUser({
      accessToken: "tok-123",
      email: "user@example.com",
      isVerified: true,
    })
  );
  deleteAccount.mockResolvedValue({ status: "success" });
});

afterEach(() => {
  store.dispatch(setUser(null));
});

test("the confirm button stays disabled until yes is typed", () => {
  renderModal();

  expect(confirmButton()).toBeDisabled();

  fireEvent.change(screen.getByPlaceholderText("yes"), {
    target: { value: "y" },
  });
  expect(confirmButton()).toBeDisabled();

  fireEvent.change(screen.getByPlaceholderText("yes"), {
    target: { value: "YES" },
  });
  expect(confirmButton()).toBeEnabled();
});

test("confirming deletes the account with the stored access token", async () => {
  renderModal();

  fireEvent.change(screen.getByPlaceholderText("yes"), {
    target: { value: "yes" },
  });
  fireEvent.click(confirmButton());

  await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith("tok-123"));
});

test("a failed delete keeps the modal open", async () => {
  const onClose = vi.fn();
  deleteAccount.mockResolvedValue({ status: "error", message: "nope" });

  renderModal(onClose);

  fireEvent.change(screen.getByPlaceholderText("yes"), {
    target: { value: "yes" },
  });
  fireEvent.click(confirmButton());

  await waitFor(() => expect(deleteAccount).toHaveBeenCalled());
  expect(onClose).not.toHaveBeenCalled();
  await waitFor(() => expect(confirmButton()).toBeEnabled());
});
