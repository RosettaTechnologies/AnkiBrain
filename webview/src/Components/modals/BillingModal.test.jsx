import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { setUser, store } from "../../api/redux";
import { asendPythonCommand } from "../../api/PythonBridge";
import { postCreateCheckoutSession } from "../../api/server-api/networking/checkout";
import {
  postCancelSubscription,
  postChangeSubscription,
  postCreateCustomerPortalSession,
  postCreateSubscriptionCheckoutSession,
  postResumeSubscription,
} from "../../api/server-api/networking/subscriptions";
import { getUser } from "../../api/server-api/networking/user";
import { BillingModal } from "./BillingModal";

vi.mock("../../api/server-api/networking/subscriptions", () => ({
  postCreateSubscriptionCheckoutSession: vi.fn(),
  postCreateCustomerPortalSession: vi.fn(),
  postChangeSubscription: vi.fn(),
  postCancelSubscription: vi.fn(),
  postResumeSubscription: vi.fn(),
}));
vi.mock("../../api/server-api/networking/checkout", () => ({
  postCreateCheckoutSession: vi.fn(),
}));
vi.mock("../../api/server-api/networking/user", () => ({ getUser: vi.fn() }));
vi.mock("../../api/toast", () => ({ infoToast: vi.fn() }));
vi.mock("../../api/PythonBridge", () => ({ asendPythonCommand: vi.fn() }));

function renderModal(onClose = () => {}) {
  return render(
    <Provider store={store}>
      <ChakraProvider>
        <BillingModal isOpen onClose={onClose} />
      </ChakraProvider>
    </Provider>
  );
}

function seedUser(overrides = {}) {
  store.dispatch(
    setUser({
      accessToken: "tok",
      email: "user@example.com",
      isVerified: true,
      balance: 3.5,
      monthlyStorageCharge: 0.5,
      ...overrides,
    })
  );
}

function subscribed(overrides = {}) {
  seedUser({
    subscriptionTier: "plus",
    subscriptionStatus: "active",
    includedUsage: 10,
    includedUsageResetAt: "2026-12-01T00:00:00.000Z",
    subscriptionCurrentPeriodEnd: "2026-12-15T00:00:00.000Z",
    subscriptionCancelAtPeriodEnd: false,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  postCreateSubscriptionCheckoutSession.mockResolvedValue({
    status: "success",
    data: { url: "https://checkout.stripe.test/session" },
  });
  postCreateCheckoutSession.mockResolvedValue({
    status: "success",
    data: { url: "https://checkout.stripe.test/balance" },
  });
  postCreateCustomerPortalSession.mockResolvedValue({
    status: "success",
    data: { url: "https://billing.stripe.test/session" },
  });
  postChangeSubscription.mockResolvedValue({
    status: "success",
    data: { user: { subscriptionTier: "pro", includedUsage: 25 } },
  });
  postCancelSubscription.mockResolvedValue({
    status: "success",
    data: { user: { subscriptionCancelAtPeriodEnd: true } },
  });
  postResumeSubscription.mockResolvedValue({
    status: "success",
    data: { user: { subscriptionCancelAtPeriodEnd: false } },
  });
  getUser.mockResolvedValue({ status: "success", data: { user: {} } });
});

afterEach(() => {
  store.dispatch(setUser(null));
});

test("an unsubscribed user sees all four plans at their published prices", () => {
  seedUser();
  renderModal();

  expect(screen.getByText("Billing & Plans")).toBeInTheDocument();
  expect(
    screen.getByText("No active plan — you are on pay-as-you-go.")
  ).toBeInTheDocument();

  expect(screen.getByText("$1 / month")).toBeInTheDocument();
  expect(screen.getByText("$4.99 / month")).toBeInTheDocument();
  expect(screen.getByText("$9.99 / month")).toBeInTheDocument();
  expect(screen.getByText("$19.99 / month")).toBeInTheDocument();

  expect(
    screen.getByText("$2 of usage each month (AI + document storage)")
  ).toBeInTheDocument();
  expect(
    screen.getByText("$65 of usage each month (AI + document storage)")
  ).toBeInTheDocument();

  expect(screen.getByText(/2× the value of pay-as-you-go/)).toBeInTheDocument();
  expect(screen.getByText(/3.25× the value of pay-as-you-go/)).toBeInTheDocument();

  // No subscription yet: every card offers Subscribe.
  expect(screen.getAllByRole("button", { name: "Subscribe" })).toHaveLength(4);
});

test("subscribing starts a Stripe checkout and renders the continue link", async () => {
  seedUser();
  renderModal();

  // Cards render in catalog order, so index 0 is Starter.
  fireEvent.click(screen.getAllByRole("button", { name: "Subscribe" })[0]);

  await waitFor(() =>
    expect(postCreateSubscriptionCheckoutSession).toHaveBeenCalledWith(
      "tok",
      "starter"
    )
  );

  const link = await screen.findByText("Continue to Stripe");
  expect(link.closest("a")).toHaveAttribute(
    "href",
    "https://checkout.stripe.test/session"
  );
});

test("a subscriber sees the current plan, upgrades, and blocked downgrades", () => {
  subscribed();
  renderModal();

  expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Upgrade" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Cancel to switch" })).toBeDisabled();
  expect(screen.getByText(/Plus plan — renews/)).toBeInTheDocument();
  expect(screen.getByText("Storage $0.50/mo (credit first)")).toBeInTheDocument();
});

test("upgrading asks for confirmation before calling Stripe", async () => {
  subscribed();
  renderModal();

  // Pro is the first higher tier, so index 0 of the Upgrade buttons.
  fireEvent.click(screen.getAllByRole("button", { name: "Upgrade" })[0]);

  expect(postChangeSubscription).not.toHaveBeenCalled();
  expect(
    screen.getByText(/Upgrade now\? Stripe charges the prorated difference/)
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Confirm upgrade" }));

  await waitFor(() =>
    expect(postChangeSubscription).toHaveBeenCalledWith("tok", "pro")
  );
});

test("canceling requires confirmation and then calls the cancel endpoint", async () => {
  subscribed();
  renderModal();

  fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));

  expect(postCancelSubscription).not.toHaveBeenCalled();
  expect(
    screen.getByText(/Cancel at period end\? You keep access and credit until/)
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));

  await waitFor(() => expect(postCancelSubscription).toHaveBeenCalledWith("tok"));
});

test("a canceling subscriber can resume instead of canceling again", async () => {
  subscribed({ subscriptionCancelAtPeriodEnd: true });
  renderModal();

  expect(screen.getByRole("button", { name: "Resume plan" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Resume plan" }));
  await waitFor(() => expect(postResumeSubscription).toHaveBeenCalledWith("tok"));
});

test("Add Balance uses the pay-as-you-go checkout", async () => {
  seedUser();
  renderModal();

  fireEvent.click(screen.getByRole("button", { name: "Add Balance" }));

  await waitFor(() =>
    expect(postCreateCheckoutSession).toHaveBeenCalledWith("tok")
  );
});

test("a failed plan change surfaces the server message", async () => {
  postChangeSubscription.mockResolvedValue({
    status: "fail",
    message: "Downgrades are not supported here.",
  });
  subscribed();
  renderModal();

  fireEvent.click(screen.getAllByRole("button", { name: "Upgrade" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Confirm upgrade" }));

  expect(
    await screen.findByText("Downgrades are not supported here.")
  ).toBeInTheDocument();
});

test("the modal drives no python bridge calls", async () => {
  seedUser();
  renderModal();

  fireEvent.click(screen.getAllByRole("button", { name: "Subscribe" })[0]);
  await waitFor(() => expect(postCreateSubscriptionCheckoutSession).toHaveBeenCalled());

  expect(asendPythonCommand).not.toHaveBeenCalled();
});

test("a local-mode user gets no billing UI", () => {
  seedUser();
  store.dispatch({ type: "userMode/setUserMode", payload: "LOCAL" });

  renderModal();

  expect(screen.queryByText("Billing & Plans")).toBeNull();

  store.dispatch({ type: "userMode/setUserMode", payload: null });
});
