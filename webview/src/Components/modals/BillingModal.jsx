import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
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
  useColorMode,
  useColorModeValue,
} from "@chakra-ui/react";
import { useRef, useState } from "react";
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
import { pyOpenUrl } from "../../api/PythonBridge/senders/pyOpenUrl";

const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

// One hue per plan so tiers are recognizable at a glance: chip, top ribbon,
// price, and badges all use it. `text`/`chipBg` are light/dark token pairs
// because the tier hue is not a color-mode-aware Chakra token.
const PLAN_META = {
  starter: {
    icon: "bi-book-half",
    accent: "teal.400",
    text: ["teal.600", "teal.300"],
    chipBg: ["teal.50", "teal.900"],
    tagline: "Light occasional review",
    bonusCopy: "+$1 bonus credit/mo",
    badgeScheme: "teal",
  },
  plus: {
    icon: "bi-stars",
    accent: "customPurple.400",
    text: ["customPurple.500", "customPurple.200"],
    chipBg: ["customPurple.50", "customPurple.800"],
    tagline: "Recommended for most students",
    badge: "Most popular · Best for most",
    bonusCopy: "+$10.01 bonus credit/mo",
    badgeScheme: "purple",
  },
  pro: {
    icon: "bi-lightning-charge-fill",
    accent: "blue.400",
    text: ["blue.600", "blue.300"],
    chipBg: ["blue.50", "blue.900"],
    tagline: "Heavy weekly card generation",
    badge: "3× credit",
    bonusCopy: "+$20.01 bonus credit/mo",
    badgeScheme: "blue",
  },
  max: {
    icon: "bi-rocket-takeoff-fill",
    accent: "orange.400",
    text: ["orange.600", "orange.300"],
    chipBg: ["orange.50", "orange.900"],
    tagline: "Exam-prep & power users",
    badge: "Best value · 3.25×",
    bonusCopy: "+$45.01 bonus credit/mo",
    badgeScheme: "orange",
  },
};

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function dollars(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function CheckLine({ children }) {
  const color = useColorModeValue("green.500", "green.300");
  return (
    <Flex align={"flex-start"} gap={2} mt={1}>
      <i
        className="bi bi-check-circle-fill"
        style={{ fontSize: 11, marginTop: 3, color }}
      />
      <Text as={"span"} fontSize={"xs"}>
        {children}
      </Text>
    </Flex>
  );
}

function Stat({ label, value, hint, valueColor }) {
  const muted = useColorModeValue("gray.600", "gray.400");
  return (
    <Box>
      <Text
        fontSize={"10px"}
        textTransform={"uppercase"}
        letterSpacing={"0.08em"}
        color={muted}
      >
        {label}
      </Text>
      <Text fontSize={"lg"} fontWeight={700} lineHeight={1.2} color={valueColor}>
        {value}
      </Text>
      {hint ? (
        <Text fontSize={"10px"} color={muted}>
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}

/*
 * Billing: plan cards, subscription status, Stripe portal, and the existing
 * pay-as-you-go top-up. The modal owns its own busy state so a plan change,
 * cancellation, portal visit, and top-up can never run concurrently.
 *
 * Checkout and portal URLs are opened by Python (OPEN_URL) so the browser opens
 * immediately, wherever the triggering button sits in the scroll area. The
 * anchor stays as a fallback when the launch is blocked.
 */
export function BillingModal({ isOpen, onClose }) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user.value);
  const userMode = useSelector((state) => state.userMode.value);

  const [busy, setBusy] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [checkoutOpened, setCheckoutOpened] = useState(false);
  const [browserAction, setBrowserAction] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const bodyRef = useRef(null);
  const { colorMode } = useColorMode();
  const isDark = colorMode === "dark";

  const cardBg = useColorModeValue("white", "whiteAlpha.50");
  const plusCardBg = useColorModeValue("customPurple.50", "whiteAlpha.100");
  const cardBorder = useColorModeValue("blackAlpha.100", "whiteAlpha.200");
  const muted = useColorModeValue("gray.600", "gray.400");
  const summaryBg = useColorModeValue("customPurple.50", "customPurple.800");
  const summaryBorder = useColorModeValue("customPurple.100", "customPurple.700");
  const insetBg = useColorModeValue("blackAlpha.50", "whiteAlpha.100");
  const headingColor = useColorModeValue("customBlack", "white");
  const headerGradient = useColorModeValue(
    "linear(to-r, customPurple.50, white)",
    "linear(to-r, customPurple.800, nightPurple)"
  );
  const closeHoverBg = useColorModeValue("blackAlpha.100", "whiteAlpha.200");

  // Money hues: green = spendable balance, purple = plan credit, blue = storage.
  const balanceColor = useColorModeValue("green.600", "green.300");
  const creditColor = useColorModeValue("purple.600", "purple.300");
  const storageColor = useColorModeValue("blue.600", "blue.300");
  const moneyChipBg = useColorModeValue("green.50", "green.900");
  const moneyChipColor = useColorModeValue("green.600", "green.300");
  const moneyRibbon = useColorModeValue(
    "linear(to-r, green.400, teal.400)",
    "linear(to-r, green.500, teal.500)"
  );

  if (!user || userMode === "LOCAL") {
    return null;
  }

  const accessToken = user.accessToken;
  const plan = getPlan(user.subscriptionTier);
  const hasSubscription = !!(user.subscriptionTier && plan);
  const isActive =
    hasSubscription && ACTIVE_STATUSES.includes(user.subscriptionStatus);
  const isPastDue = hasSubscription && user.subscriptionStatus === "past_due";
  const cancelingAtPeriodEnd =
    hasSubscription && !!user.subscriptionCancelAtPeriodEnd;
  const periodEnd = formatDate(user.subscriptionCurrentPeriodEnd);
  const resetAt = formatDate(user.includedUsageResetAt);
  const showResetHint =
    hasSubscription && !cancelingAtPeriodEnd && !isPastDue && resetAt;
  const statusBadge = isPastDue
    ? { label: "Past due", scheme: "red" }
    : cancelingAtPeriodEnd
    ? { label: "Canceling", scheme: "orange" }
    : hasSubscription
    ? { label: "Active", scheme: "green" }
    : { label: "No plan", scheme: "gray" };
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

  async function startCheckout(work, kind = "checkout") {
    setPending(null);
    setCheckoutUrl(null);
    setCheckoutOpened(false);
    setBrowserAction(kind);
    const res = await work();
    if (!(res && res.status === "success")) {
      setBrowserAction(null);
      setError((res && res.message) || "Could not start checkout.");
      return;
    }
    const url = res.data && res.data.url;
    if (!url) {
      setBrowserAction(null);
      setError("Stripe did not return a checkout link. Please try again.");
      return;
    }
    setCheckoutUrl(url);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const opened = await pyOpenUrl(url);
    setCheckoutOpened(opened);
  }
  async function retryOpenCheckout() {
    if (!checkoutUrl) return;
    const opened = await pyOpenUrl(checkoutUrl);
    setCheckoutOpened(opened);
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
      startCheckout(
        () => postCreateCustomerPortalSession(accessToken),
        "portal"
      )
    );
  }

  function handleAddBalance() {
    return run("balance", () =>
      startCheckout(() => postCreateCheckoutSession(accessToken), "checkout")
    );
  }

  function handleRefresh() {
    return run("refresh", async () => {
      await refreshUser();
      setCheckoutUrl(null);
      setCheckoutOpened(false);
      setBrowserAction(null);
      setPending(null);
    });
  }

  function close() {
    if (busy) return;
    setCheckoutUrl(null);
    setCheckoutOpened(false);
    setBrowserAction(null);
    setError(null);
    setPending(null);
    refreshUser();
    onClose();
  }

  function planButton(planOption) {
    const isCurrent = user.subscriptionTier === planOption.id && isActive;
    const upgrade =
      hasSubscription && isUpgrade(user.subscriptionTier, planOption.id);
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
      const isEntry = planOption.id === "starter";
      return (
        <Button
          size={"sm"}
          variant={isEntry ? "outline" : "accent"}
          boxShadow={planOption.id === "plus" ? "sm" : undefined}
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
      closeOnOverlayClick={!busy}
      closeOnEsc={!busy}
      size={"4xl"}
      scrollBehavior={"inside"}
      isCentered
    >
      <ModalOverlay bg={"blackAlpha.700"} />
      <ModalContent
        borderRadius={"2xl"}
        overflow={"hidden"}
        borderWidth={"1px"}
        borderColor={cardBorder}
      >
        <ModalHeader p={0}>
          <Box bgGradient={headerGradient} px={6} py={5} pr={14}>
            <Heading size={"md"}>Billing &amp; Plans</Heading>
            <Text fontSize={"sm"} mt={1} color={muted}>
              Get up to 3.25× more AI &amp; storage credit with a monthly plan, or
              top up a one-time balance.
            </Text>
          </Box>
        </ModalHeader>
        <ModalCloseButton
          isDisabled={!!busy}
          color={headingColor}
          _hover={{ bg: closeHoverBg }}
        />
        <ModalBody pb={6} ref={bodyRef}>
          {checkoutUrl && (
            <Alert
              status={checkoutOpened ? "success" : "warning"}
              variant={"subtle"}
              mb={3}
              borderRadius={"lg"}
              alignItems={"start"}
            >
              <AlertIcon />
              <Box>
                <AlertTitle>
                  {checkoutOpened
                    ? browserAction === "portal"
                      ? "Stripe billing portal opened in your browser."
                      : "Stripe checkout opened in your browser."
                    : "Your browser did not open automatically."}
                </AlertTitle>
                <AlertDescription display={"block"}>
                  <Text fontSize={"sm"}>
                    {browserAction === "portal"
                      ? "Update your payment method or billing details in Stripe, then click Refresh status."
                      : "Complete the payment in Stripe, then click Refresh status."}
                  </Text>
                  <a
                    href={checkoutUrl}
                    style={{ color: "inherit", fontWeight: 600, fontSize: 12 }}
                  >
                    Continue to Stripe
                  </a>
                </AlertDescription>
                <Flex gap={2} mt={2}>
                  <Button size={"xs"} variant={"outline"} onClick={retryOpenCheckout}>
                    Open browser
                  </Button>
                  <Button
                    size={"xs"}
                    variant={"ghost"}
                    onClick={() => {
                      setCheckoutUrl(null);
                      setBrowserAction(null);
                    }}
                  >
                    Dismiss
                  </Button>
                </Flex>
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

          <Box
            bg={summaryBg}
            borderColor={summaryBorder}
            borderWidth={"1px"}
            borderRadius={"xl"}
            p={4}
            mb={4}
          >
            <Flex justify={"space-between"} align={"flex-start"} gap={2}>
              {hasSubscription && plan ? (
                <Heading size={"sm"}>
                  {plan.name} plan —{" "}
                  {cancelingAtPeriodEnd ? "cancels" : "renews"}
                  {periodEnd ? ` ${periodEnd}` : " automatically"}
                </Heading>
              ) : (
                <Heading size={"sm"}>
                  No active plan — you are on pay-as-you-go.
                </Heading>
              )}
              <Badge
                colorScheme={statusBadge.scheme}
                variant={"subtle"}
                flexShrink={0}
              >
                {statusBadge.label}
              </Badge>
            </Flex>

            <SimpleGrid columns={3} spacing={3} mt={3}>
              <Stat
                label={"Plan credit"}
                value={hasSubscription ? dollars(user.includedUsage) : "—"}
                hint={showResetHint ? `Resets ${resetAt}` : null}
                valueColor={creditColor}
              />
              <Stat
                label={"Balance"}
                value={dollars(user.balance)}
                hint={"Available now"}
                valueColor={balanceColor}
              />
              <Stat
                label={"Storage"}
                value={`${dollars(user.monthlyStorageCharge)}/mo`}
                hint={hasSubscription ? "Credit first" : "From balance"}
                valueColor={storageColor}
              />
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mt={3}>
              <Box p={2.5} bg={insetBg} borderRadius={"lg"}>
                <Flex align={"center"} gap={1.5} wrap={"wrap"}>
                  <Text fontSize={"xs"} fontWeight={700} color={creditColor}>
                    Monthly Plans
                  </Text>
                  <Badge colorScheme={"purple"} variant={"subtle"} fontSize={"9px"}>
                    Recommended · 2×–3.25× credit
                  </Badge>
                </Flex>
                <Text fontSize={"11px"} color={muted} mt={0.5}>
                  Recurring 30-day usage allowance spent first on flashcards,
                  chat, occlusion &amp; storage. Cancel anytime.
                </Text>
              </Box>
              <Box p={2.5} bg={insetBg} borderRadius={"lg"}>
                <Flex align={"center"} gap={1.5} wrap={"wrap"}>
                  <Text fontSize={"xs"} fontWeight={700} color={balanceColor}>
                    Pay-As-You-Go Balance
                  </Text>
                  <Badge colorScheme={"gray"} variant={"subtle"} fontSize={"9px"}>
                    1× standard rate
                  </Badge>
                </Flex>
                <Text fontSize={"11px"} color={muted} mt={0.5}>
                  Optional one-time top-up credit that never expires and acts as
                  automatic backup if plan credit runs out.
                </Text>
              </Box>
            </SimpleGrid>

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
              <Box
                mt={3}
                p={3}
                bg={insetBg}
                borderColor={cardBorder}
                borderWidth={"1px"}
                borderRadius={"lg"}
              >
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

          <Flex
            justify={"space-between"}
            align={"center"}
            wrap={"wrap"}
            gap={2}
            mb={2.5}
          >
            <Heading size={"sm"}>Monthly Plans</Heading>
            <Badge
              colorScheme={"purple"}
              variant={"subtle"}
              fontSize={"10px"}
              textTransform={"none"}
            >
              Up to 3.25× more usage per dollar · Cancel anytime
            </Badge>
          </Flex>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3}>
            {SUBSCRIPTION_PLANS.map((planOption) => {
              const meta = PLAN_META[planOption.id];
              const tierColor = isDark ? meta.text[1] : meta.text[0];
              const isCurrent =
                user.subscriptionTier === planOption.id && isActive;
              const isPlus = planOption.id === "plus";
              const featured = isCurrent || isPlus;
              return (
                <Box
                  key={planOption.id}
                  position={"relative"}
                  overflow={"hidden"}
                  display={"flex"}
                  flexDirection={"column"}
                  p={5}
                  bg={isPlus && !hasSubscription ? plusCardBg : cardBg}
                  borderRadius={"xl"}
                  borderWidth={featured ? "2px" : "1px"}
                  borderColor={
                    isCurrent
                      ? "green.400"
                      : isPlus
                      ? "customPurple.400"
                      : cardBorder
                  }
                  boxShadow={isPlus ? "lg" : "sm"}
                  transition={
                    "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease"
                  }
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "xl",
                    borderColor: isCurrent ? "green.400" : meta.accent,
                  }}
                >
                  <Box
                    position={"absolute"}
                    top={0}
                    left={0}
                    right={0}
                    height={isPlus ? "6px" : "4px"}
                    bg={isPlus ? undefined : meta.accent}
                    bgGradient={
                      isPlus
                        ? "linear(to-r, customPurple.400, pink.400)"
                        : undefined
                    }
                  />

                  <Flex justify={"space-between"} align={"flex-start"} gap={2}>
                    <Flex align={"center"} gap={2}>
                      <Flex
                        boxSize={10}
                        borderRadius={"lg"}
                        bg={isDark ? meta.chipBg[1] : meta.chipBg[0]}
                        align={"center"}
                        justify={"center"}
                      >
                        <i
                          className={`bi ${meta.icon}`}
                          style={{ color: meta.accent, fontSize: 18 }}
                        />
                      </Flex>
                      <Box>
                        <Heading size={"sm"} color={tierColor}>
                          {planOption.name}
                        </Heading>
                        <Text fontSize={"10px"} color={muted}>
                          {meta.tagline}
                        </Text>
                      </Box>
                    </Flex>
                    {isCurrent ? (
                      <Badge colorScheme={"green"} variant={"subtle"}>
                        Current
                      </Badge>
                    ) : meta.badge ? (
                      <Badge colorScheme={meta.badgeScheme} variant={"subtle"}>
                        {meta.badge}
                      </Badge>
                    ) : null}
                  </Flex>

                  <Flex align={"baseline"} gap={1} mt={3}>
                    <Text
                      fontSize={"3xl"}
                      fontWeight={800}
                      lineHeight={1}
                      letterSpacing={"-0.02em"}
                      color={tierColor}
                    >
                      {formatUsd(planOption.price)}
                    </Text>
                    <Text fontSize={"xs"} color={muted}>
                      / month
                    </Text>
                  </Flex>

                  <Text fontSize={"sm"} mt={3}>
                    {formatUsd(planOption.includedUsage)} of usage each month (AI +
                    document storage)
                  </Text>

                  <Flex gap={1.5} wrap={"wrap"} mt={2}>
                    <Badge
                      colorScheme={meta.badgeScheme}
                      variant={"subtle"}
                      fontSize={10}
                      textTransform={"none"}
                    >
                      {formatMultiplier(planOption.valueMultiplier)} the value of
                      pay-as-you-go
                    </Badge>
                    {meta.bonusCopy && (
                      <Badge
                        colorScheme={"green"}
                        variant={"subtle"}
                        fontSize={10}
                        textTransform={"none"}
                      >
                        {meta.bonusCopy}
                      </Badge>
                    )}
                  </Flex>

                  <Text fontSize={"xs"} color={muted} mt={1.5}>
                    ≈ {estimatedFlashcards(planOption).toLocaleString()} flashcards
                  </Text>

                  {planOption.extras.length > 0 && (
                    <Box mt={3}>
                      {planOption.extras.map((extra) => (
                        <CheckLine key={extra}>{extra}</CheckLine>
                      ))}
                    </Box>
                  )}

                  <Box flex={1} />
                  <Box mt={4}>{planButton(planOption)}</Box>

                  {pending?.type === "upgrade" &&
                    pending.tierId === planOption.id && (
                      <Box
                        mt={2}
                        p={3}
                        bg={insetBg}
                        borderColor={cardBorder}
                        borderWidth={"1px"}
                        borderRadius={"lg"}
                      >
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
              );
            })}
          </SimpleGrid>

          <Box
            position={"relative"}
            overflow={"hidden"}
            p={4}
            mt={4}
            bg={cardBg}
            borderWidth={"1px"}
            borderColor={cardBorder}
            borderRadius={"xl"}
          >
            <Box
              position={"absolute"}
              top={0}
              left={0}
              right={0}
              height={"3px"}
              bgGradient={moneyRibbon}
            />

            <Flex
              justify={"space-between"}
              align={{ base: "flex-start", sm: "center" }}
              direction={{ base: "column", sm: "row" }}
              gap={3}
            >
              <Flex align={"center"} gap={2.5}>
                <Flex
                  boxSize={9}
                  borderRadius={"lg"}
                  bg={moneyChipBg}
                  align={"center"}
                  justify={"center"}
                  flexShrink={0}
                >
                  <i
                    className="bi bi-wallet2"
                    style={{ fontSize: 15, color: moneyChipColor }}
                  />
                </Flex>
                <Box>
                  <Flex align={"center"} gap={2} wrap={"wrap"}>
                    <Heading size={"sm"}>Pay as you go</Heading>
                    <Badge
                      colorScheme={"gray"}
                      variant={"subtle"}
                      fontSize={"9px"}
                      textTransform={"none"}
                    >
                      1× standard rate · No monthly bonus
                    </Badge>
                  </Flex>
                  <Text fontSize={"xs"} color={muted} mt={0.5}>
                    One-time balance never expires and is used only when you have
                    no active plan credit.
                  </Text>
                </Box>
              </Flex>

              <Flex align={"center"} gap={2} flexShrink={0}>
                <Badge
                  colorScheme={"green"}
                  variant={"subtle"}
                  fontSize={10}
                  textTransform={"none"}
                >
                  Balance {dollars(user.balance)}
                </Badge>
                <Button
                  size={"sm"}
                  variant={"outline"}
                  leftIcon={<i className="bi bi-plus-circle" />}
                  isDisabled={!!busy}
                  isLoading={busy === "balance"}
                  onClick={handleAddBalance}
                >
                  Add Balance
                </Button>
              </Flex>
            </Flex>

            <SimpleGrid columns={2} spacing={2.5} mt={3}>
              <Box p={2.5} bg={insetBg} borderRadius={"lg"}>
                <Text
                  fontSize={"10px"}
                  textTransform={"uppercase"}
                  letterSpacing={"0.08em"}
                  color={muted}
                >
                  Flashcards
                </Text>
                <Text fontSize={"sm"} fontWeight={700} color={balanceColor}>
                  ≈ 100
                </Text>
                <Text fontSize={"xs"} color={muted}>
                  for about $0.03
                </Text>
              </Box>
              <Box p={2.5} bg={insetBg} borderRadius={"lg"}>
                <Text
                  fontSize={"10px"}
                  textTransform={"uppercase"}
                  letterSpacing={"0.08em"}
                  color={muted}
                >
                  Document storage
                </Text>
                <Text fontSize={"sm"} fontWeight={700} color={storageColor}>
                  ≈ 2,850 pages
                </Text>
                <Text fontSize={"xs"} color={muted}>
                  for $1.00 / month
                </Text>
              </Box>
            </SimpleGrid>

            <Text fontSize={"10px"} color={muted} mt={2}>
              Storage only applies to documents imported via the Import tab, not
              to flashcards created in the Make Cards tab.
            </Text>
          </Box>
          <Text fontSize={10} color={muted} mt={4}>
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
