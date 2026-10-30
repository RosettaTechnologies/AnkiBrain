import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateUser } from "../../api/redux";
import { infoToast } from "../../api/toast";
import {
  SUBSCRIPTION_PLANS,
  estimatedFlashcards,
  formatMultiplier,
  formatUsd,
  getPlan,
  isUpgrade,
} from "../../api/subscriptions";
import { postCreateCheckoutSession } from "../../api/server-api/networking/checkout";
import {
  postCancelSubscription,
  postChangeSubscription,
  postCreateCustomerPortalSession,
  postCreateSubscriptionCheckoutSession,
  postResumeSubscription,
} from "../../api/server-api/networking/subscriptions";
import { getUser } from "../../api/server-api/networking/user";

const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function dollars(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

/*
 * Billing: plan cards, subscription status, Stripe portal, and the existing
 * pay-as-you-go top-up. The modal owns its own busy state so a plan change,
 * cancellation, portal visit, and top-up can never run concurrently.
 *
 * Checkout and portal URLs are rendered as real anchors: the add-on's
 * WebEnginePage.acceptNavigationRequest opens them in the system browser.
 */
export function BillingModal({ isOpen, onClose }) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user.value);
  const userMode = useSelector((state) => state.userMode.value);

  const [busy, setBusy] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);

  if (!user || userMode === "LOCAL") {
    return null;
  }

  const accessToken = user.accessToken;
  const plan = getPlan(user.subscriptionTier);
  const hasSubscription = !!user.subscriptionTier;
  const isActive = ACTIVE_STATUSES.includes(user.subscriptionStatus);
  const isPastDue = user.subscriptionStatus === "past_due";
  const cancelingAtPeriodEnd = !!user.subscriptionCancelAtPeriodEnd;
  const periodEnd = formatDate(user.subscriptionCurrentPeriodEnd);
  const resetAt = formatDate(user.includedUsageResetAt);

  async function refreshUser() {
    if (!accessToken) return;
    const res = await getUser(accessToken);
    if (res && res.status === "success") {
      dispatch(updateUser(res.data.user));
    }
  }

  async function run(action, work) {
    if (!accessToken || busy) return;
    setError(null);
    setBusy(action);
    try {
      await work();
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function startCheckout(work) {
    setCheckoutUrl(null);
    const res = await work();
    if (res && res.status === "success") {
      setCheckoutUrl(res.data.url);
    } else {
      setError((res && res.message) || "Could not start checkout.");
    }
  }

  function handleSubscribe(tierId) {
    return run("subscribe", () =>
      startCheckout(() => postCreateSubscriptionCheckoutSession(accessToken, tierId))
    );
  }

  function handleUpgrade(tierId) {
    return run("upgrade", async () => {
      const res = await postChangeSubscription(accessToken, tierId);
      if (res && res.status === "success") {
        dispatch(updateUser(res.data.user));
        infoToast("Plan updated", "Your new plan credit is available now.");
        setPending(null);
      } else {
        setError((res && res.message) || "Could not change your plan.");
      }
    });
  }

  function handleCancel() {
    return run("cancel", async () => {
      const res = await postCancelSubscription(accessToken);
      if (res && res.status === "success") {
        dispatch(updateUser(res.data.user));
        infoToast(
          "Plan canceled",
          "Your plan stays active until the end of the current billing period."
        );
        setPending(null);
      } else {
        setError((res && res.message) || "Could not cancel your plan.");
      }
    });
  }

  function handleResume() {
    return run("resume", async () => {
      const res = await postResumeSubscription(accessToken);
      if (res && res.status === "success") {
        dispatch(updateUser(res.data.user));
        infoToast("Plan resumed", "Your plan will renew automatically.");
      } else {
        setError((res && res.message) || "Could not resume your plan.");
      }
    });
  }

  function handlePortal() {
    return run("portal", () =>
      startCheckout(() => postCreateCustomerPortalSession(accessToken))
    );
  }

  function handleAddBalance() {
    return run("balance", () =>
      startCheckout(() => postCreateCheckoutSession(accessToken))
    );
  }

  function handleRefresh() {
    return run("refresh", refreshUser);
  }

  function close() {
    setCheckoutUrl(null);
    setError(null);
    setPending(null);
    refreshUser();
    onClose();
  }

  function planButton(planOption) {
    const isCurrent = user.subscriptionTier === planOption.id && isActive;
    const upgrade = hasSubscription && isUpgrade(user.subscriptionTier, planOption.id);
    const downgrade = hasSubscription && !upgrade && !isCurrent;
    const disabled = !!busy || isPastDue;

    if (isCurrent) {
      return (
        <Button size={"sm"} variant={"outline"} isDisabled width={"100%"}>
          Current plan
        </Button>
      );
    }

    if (!hasSubscription) {
      return (
        <Button
          size={"sm"}
          variant={"accent"}
          width={"100%"}
          isDisabled={disabled}
          isLoading={busy === "subscribe"}
          onClick={() => handleSubscribe(planOption.id)}
        >
          Subscribe
        </Button>
      );
    }

    if (downgrade) {
      return (
        <Button size={"sm"} variant={"outline"} isDisabled width={"100%"}>
          Cancel to switch
        </Button>
      );
    }

    return (
      <Button
        size={"sm"}
        variant={"accent"}
        width={"100%"}
        isDisabled={disabled}
        isLoading={busy === "upgrade"}
        onClick={() => {
          setError(null);
          setPending({ type: "upgrade", tierId: planOption.id });
        }}
      >
        Upgrade
      </Button>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size={"4xl"}
      scrollBehavior={"inside"}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Billing &amp; Plans</ModalHeader>
        <ModalCloseButton isDisabled={!!busy} />
        <ModalBody pb={6}>
          {checkoutUrl && (
            <Alert status={"info"} mb={3} borderRadius={"md"} alignItems={"start"}>
              <AlertIcon />
              <Box>
                <AlertDescription display={"block"}>
                  <a href={checkoutUrl} style={{ color: "inherit", fontWeight: 600 }}>
                    Continue to Stripe
                  </a>
                  <Text fontSize={12} mt={1}>
                    The page opens in your browser. Come back here and click
                    Refresh status when you are done.
                  </Text>
                </AlertDescription>
                <Button
                  size={"xs"}
                  mt={2}
                  variant={"ghost"}
                  onClick={() => setCheckoutUrl(null)}
                >
                  Cancel
                </Button>
              </Box>
            </Alert>
          )}

          {error && (
            <Alert status={"error"} mb={3} borderRadius={"md"}>
              <AlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isPastDue && (
            <Alert status={"error"} mb={3} borderRadius={"md"}>
              <AlertIcon />
              <AlertDescription>
                Payment failed. Update your payment method to keep your plan.
              </AlertDescription>
            </Alert>
          )}

          <Box borderWidth={"1px"} borderRadius={"md"} p={3} mb={4}>
            {hasSubscription && plan ? (
              <>
                <Heading size={"sm"}>
                  {plan.name} plan —{" "}
                  {cancelingAtPeriodEnd ? "cancels" : "renews"}
                  {periodEnd ? ` ${periodEnd}` : " automatically"}
                </Heading>
                <Text fontSize={12} mt={1}>
                  Plan credit {dollars(user.includedUsage)}
                  {resetAt ? ` — resets ${resetAt}` : ""}
                </Text>
              </>
            ) : (
              <Heading size={"sm"}>
                No active plan — you are on pay-as-you-go.
              </Heading>
            )}
            <Text fontSize={12} mt={1}>
              Balance {dollars(user.balance)}
            </Text>
            <Text fontSize={12}>
              Storage {dollars(user.monthlyStorageCharge)}/mo (
              {hasSubscription ? "credit first" : "balance"})
            </Text>

            <Flex gap={2} mt={3} wrap={"wrap"}>
              {hasSubscription && (
                <Button
                  size={"xs"}
                  variant={"outline"}
                  isDisabled={!!busy}
                  isLoading={busy === "portal"}
                  onClick={handlePortal}
                >
                  Manage payment method
                </Button>
              )}
              {hasSubscription &&
                (cancelingAtPeriodEnd ? (
                  <Button
                    size={"xs"}
                    variant={"outline"}
                    isDisabled={!!busy}
                    isLoading={busy === "resume"}
                    onClick={handleResume}
                  >
                    Resume plan
                  </Button>
                ) : (
                  <Button
                    size={"xs"}
                    variant={"outline"}
                    isDisabled={!!busy}
                    onClick={() => {
                      setError(null);
                      setPending({ type: "cancel" });
                    }}
                  >
                    Cancel plan
                  </Button>
                ))}
              <Button
                size={"xs"}
                variant={"ghost"}
                isDisabled={!!busy}
                isLoading={busy === "refresh"}
                onClick={handleRefresh}
              >
                Refresh status
              </Button>
            </Flex>

            {pending?.type === "cancel" && (
              <Box mt={3} p={2} borderWidth={"1px"} borderRadius={"md"}>
                <Text fontSize={12}>
                  Cancel at period end? You keep access and credit until{" "}
                  {periodEnd || "the end of the current billing period"}. Existing
                  documents and storage limits are unchanged; only the monthly
                  plan credit ends. After that, usage and storage charges use
                  your pay-as-you-go balance. No refund is issued for the current
                  period.
                </Text>
                <Flex gap={2} mt={2}>
                  <Button
                    size={"xs"}
                    colorScheme={"red"}
                    isDisabled={!!busy}
                    isLoading={busy === "cancel"}
                    onClick={handleCancel}
                  >
                    Confirm cancel
                  </Button>
                  <Button
                    size={"xs"}
                    variant={"ghost"}
                    isDisabled={!!busy}
                    onClick={() => setPending(null)}
                  >
                    Never mind
                  </Button>
                </Flex>
              </Box>
            )}
          </Box>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3}>
            {SUBSCRIPTION_PLANS.map((planOption) => (
              <Box
                key={planOption.id}
                borderWidth={"1px"}
                borderRadius={"md"}
                p={3}
                display={"flex"}
                flexDirection={"column"}
              >
                <Flex justifyContent={"space-between"} alignItems={"baseline"}>
                  <Heading size={"sm"}>{planOption.name}</Heading>
                  <Text fontSize={12} fontWeight={600}>
                    {formatUsd(planOption.price)} / month
                  </Text>
                </Flex>
                <Text fontSize={12} mt={1}>
                  {formatUsd(planOption.includedUsage)} of usage each month (AI +
                  document storage)
                </Text>
                <Badge
                  mt={2}
                  alignSelf={"flex-start"}
                  colorScheme={"green"}
                  fontSize={10}
                  textTransform={"none"}
                >
                  {formatMultiplier(planOption.valueMultiplier)} the value of
                  pay-as-you-go
                </Badge>
                <Text fontSize={11} color={"gray.500"} mt={1}>
                  ≈ {estimatedFlashcards(planOption).toLocaleString()} flashcards
                </Text>
                {planOption.extras.length > 0 && (
                  <Text fontSize={11} mt={1}>
                    {planOption.extras.join(" • ")}
                  </Text>
                )}
                <Box mt={3}>{planButton(planOption)}</Box>
                {pending?.type === "upgrade" &&
                  pending.tierId === planOption.id && (
                    <Box mt={2} p={2} borderWidth={"1px"} borderRadius={"md"}>
                      <Text fontSize={12}>
                        Upgrade now? Stripe charges the prorated difference today
                        and your monthly credit increases immediately.
                      </Text>
                      <Flex gap={2} mt={2}>
                        <Button
                          size={"xs"}
                          variant={"accent"}
                          isDisabled={!!busy}
                          isLoading={busy === "upgrade"}
                          onClick={() => handleUpgrade(planOption.id)}
                        >
                          Confirm upgrade
                        </Button>
                        <Button
                          size={"xs"}
                          variant={"ghost"}
                          isDisabled={!!busy}
                          onClick={() => setPending(null)}
                        >
                          Never mind
                        </Button>
                      </Flex>
                    </Box>
                  )}
              </Box>
            ))}
          </SimpleGrid>

          <Divider my={4} />

          <Text fontSize={12} fontWeight={600}>Pay as you go</Text>
          <Text fontSize={12} mt={1}>
            GPT 5.6 Luna (default) can generate about <b>100 flashcards</b> for
            about <b>$0.03</b>. $1.00 stores about <b>2,850 pages</b> for one
            month.
          </Text>
          <Text fontSize={10} color={"gray.500"} mt={1}>
            Storage only applies to documents imported via the Import tab, not to
            flashcards created in the Make Cards tab.
          </Text>
          <Button
            size={"sm"}
            variant={"outline"}
            mt={2}
            isDisabled={!!busy}
            isLoading={busy === "balance"}
            onClick={handleAddBalance}
          >
            Add Balance
          </Button>

          <Text fontSize={10} color={"gray.500"} mt={4}>
            Subscriptions renew monthly until canceled. Plan credit is used first
            for chat, occlusion, and document storage; when it runs out, charges
            use your pay-as-you-go balance. Credit resets every 30 days and does
            not roll over. Document storage capacity and upload limits are
            unchanged. Estimates vary by model and prompt length.
          </Text>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
