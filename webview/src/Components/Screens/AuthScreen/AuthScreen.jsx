import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Heading,
  Input,
  Link,
  Spinner,
  Text,
  useColorMode,
} from "@chakra-ui/react";
import {
  login,
  logout,
  resendVerificationCode,
  signup,
  verifyEmail,
} from "../../../api/user";
import {
  postPasswordReset,
  postRequestPasswordResetCode,
} from "../../../api/server-api/networking/user";
import { getAPIEndpoints } from "../../../api/server-api/networking";
import { successToast } from "../../../api/toast";
import { setUserModeSelectorOpen } from "../../../api/redux/slices/userModeSelector";

const MODES = {
  LOGIN: "login",
  SIGNUP: "signup",
  VERIFY: "verify",
  RESET: "reset",
};

// Full-screen server-mode gate. Nothing else in the app renders until a
// verified session exists, so this owns every pre-login flow: login,
// signup, email verification, and password reset (the Settings screen
// copy of reset stays available to logged-in users).
export function AuthScreen() {
  const user = useSelector((state) => state.user.value);
  const checkedAuth = useSelector((state) => state.checkedAuth.value);
  const devMode = useSelector((state) => state.devMode.value);

  const [mode, setMode] = useState(MODES.LOGIN);
  const [busy, setBusy] = useState(false);
  // Validation failures are shown inline in whichever form is on screen
  // instead of as a toast/dialog.
  const [formError, setFormError] = useState("");

  // Shared email/password fields.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedPP, setAgreedPP] = useState(false);
  const [agreedTOS, setAgreedTOS] = useState(false);

  // Email verification step.
  const [verificationCode, setVerificationCode] = useState("");

  // Password reset step: request a code, then confirm with the new password.
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [privacyPolicyLink, setPrivacyPolicyLink] = useState(
    getAPIEndpoints().PRIVACY_POLICY
  );
  const [termsOfServiceLink, setTermsOfServiceLink] = useState(
    getAPIEndpoints().TERMS_OF_SERVICE
  );

  useEffect(() => {
    setPrivacyPolicyLink(getAPIEndpoints().PRIVACY_POLICY);
    setTermsOfServiceLink(getAPIEndpoints().TERMS_OF_SERVICE);
  }, [devMode]);

  // Keep the screen in sync with the auth state: an account that exists but
  // is not verified always lands on the verification step, and logging out
  // (or a failed session restore) returns to the login form. This makes
  // signup -> auto-login -> verify flow fall out of the store for free.
  useEffect(() => {
    if (user && !user.isVerified) {
      setMode(MODES.VERIFY);
    } else if (!user && mode === MODES.VERIFY) {
      setMode(MODES.LOGIN);
      setVerificationCode("");
    }
  }, [user, mode]);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  function handleLogin(e) {
    e.preventDefault();
    setFormError("");
    if (!email || !password) {
      setFormError("Enter your email and password.");
      return;
    }
    run(async () => {
      // On success, login() sets the user in the store and the gate opens.
      await login(email, password);
    });
  }

  function handleSignup(e) {
    e.preventDefault();
    setFormError("");
    if (!email || !password) {
      setFormError("Enter an email and password.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Make sure your password and password confirmation match.");
      return;
    }
    if (!agreedPP || !agreedTOS) {
      setFormError(
        "Please agree to both the Privacy Policy and Terms of Service before registering."
      );
      return;
    }
    run(async () => {
      // signup() creates the account and then logs in, which leaves the
      // store holding an unverified user; the effect above switches to the
      // verification step.
      await signup(email, password);
    });
  }

  function handleVerify(e) {
    e.preventDefault();
    setFormError("");
    if (!verificationCode) {
      setFormError("Enter the verification code from your email.");
      return;
    }
    run(async () => {
      await verifyEmail(verificationCode, user.accessToken);
    });
  }

  function handleRequestResetCode(e) {
    e.preventDefault();
    setFormError("");
    if (!email) {
      setFormError("Enter the email address for your account.");
      return;
    }
    run(async () => {
      const res = await postRequestPasswordResetCode(email);
      if (res.status === "success") {
        successToast(
          "Password Reset Email",
          "A password reset verification code has been sent to the email address given."
        );
        setResetCodeSent(true);
      }
    });
  }

  function handleConfirmReset(e) {
    e.preventDefault();
    setFormError("");
    if (!resetCode || !newPassword) {
      setFormError("Enter the verification code and choose a new password.");
      return;
    }
    run(async () => {
      const res = await postPasswordReset(email, newPassword, resetCode);
      if (res.status === "success") {
        successToast(
          "Password Reset",
          "Your password has been reset. You can now log in."
        );
        setResetCodeSent(false);
        setResetCode("");
        setNewPassword("");
        setPassword("");
        setMode(MODES.LOGIN);
      }
    });
  }

  function handleLogoutFromVerify() {
    run(async () => {
      await logout();
    });
  }

  // A persisted session is being validated against the server. Show a
  // neutral state rather than flashing the login form first.
  if (!checkedAuth) {
    return (
      <AuthCard title="AnkiBrain" subtitle="Checking your session...">
        <Flex justify="center" py={6}>
          <Spinner thickness="3px" color="accent" size="lg" />
        </Flex>
      </AuthCard>
    );
  }

  if (mode === MODES.VERIFY && user) {
    return (
      <AuthCard
        title="Verify your email"
        subtitle={`We sent a verification code to ${user.email}.`}
      >
        <form onSubmit={handleVerify}>
          <Input
            mb={3}
            placeholder="Verification code..."
            value={verificationCode}
            onChange={(e) => {
              setVerificationCode(e.target.value);
            }}
          />
          {formError && (
            <Text color={"red.400"} fontSize={12} mb={2}>
              {formError}
            </Text>
          )}
          <Button type="submit" variant="accent" width="100%" isDisabled={busy}>
            Validate
          </Button>
        </form>
        <Text fontSize={12} mt={3} color="gray">
          If you don&apos;t see the code, <b>check your spam folder.</b>
        </Text>
        <Button
          mt={3}
          width="100%"
          isDisabled={busy}
          onClick={() => {
            run(async () => {
              await resendVerificationCode(user.accessToken);
            });
          }}
        >
          Resend verification code to my email
        </Button>
        <Divider mt={5} mb={3} />
        <Button variant="ghost" width="100%" onClick={handleLogoutFromVerify}>
          Log in with a different account
        </Button>
      </AuthCard>
    );
  }

  if (mode === MODES.RESET) {
    return (
      <AuthCard
        title="Reset your password"
        subtitle={
          resetCodeSent
            ? "Enter the code we emailed you and choose a new password."
            : "Enter your account email and we'll send you a verification code."
        }
      >
        {!resetCodeSent ? (
          <form onSubmit={handleRequestResetCode}>
            <Input
              mb={3}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            <Button
              type="submit"
              variant="accent"
              width="100%"
              isDisabled={busy}
            >
              Send verification code
            </Button>
            {formError && (
              <Text color={"red.400"} fontSize={12} mt={2}>
                {formError}
              </Text>
            )}
          </form>
        ) : (
          <form onSubmit={handleConfirmReset}>
            <Input
              mb={3}
              placeholder="Verification code"
              value={resetCode}
              onChange={(e) => {
                setResetCode(e.target.value);
              }}
            />
            <Input
              mb={3}
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
              }}
            />
            {formError && (
              <Text color={"red.400"} fontSize={12} mb={2}>
                {formError}
              </Text>
            )}
            <Button
              type="submit"
              variant="accent"
              width="100%"
              isDisabled={busy}
            >
              Reset password
            </Button>
          </form>
        )}
        <Button
          variant="ghost"
          width="100%"
          mt={3}
          onClick={() => {
            setResetCodeSent(false);
            setResetCode("");
            setNewPassword("");
            setMode(MODES.LOGIN);
          }}
        >
          Back to login
        </Button>
      </AuthCard>
    );
  }

  const isSignup = mode === MODES.SIGNUP;

  return (
    <AuthCard
      title="Welcome to AnkiBrain"
      subtitle={
        isSignup
          ? "Create your account to start studying."
          : "Log in to your AnkiBrain account to continue."
      }
    >
      <form onSubmit={isSignup ? handleSignup : handleLogin}>
        <label className="form-label" htmlFor="auth-email">
          Email address
        </label>
        <Input
          id="auth-email"
          mb={3}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <label className="form-label" htmlFor="auth-password">
          Password
        </label>
        <Input
          id="auth-password"
          mb={3}
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        {isSignup && (
          <>
            <label className="form-label" htmlFor="auth-confirm">
              Confirm password
            </label>
            <Input
              id="auth-confirm"
              mb={3}
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
              }}
            />
            <Checkbox
              mb={2}
              isChecked={agreedPP}
              onChange={(e) => {
                setAgreedPP(e.target.checked);
              }}
            >
              <Text as="span" fontSize={12}>
                I have read and agree to the{" "}
                <Link color="teal.500" href={privacyPolicyLink} isExternal>
                  Privacy Policy
                </Link>
              </Text>
            </Checkbox>
            <Checkbox
              mb={3}
              isChecked={agreedTOS}
              onChange={(e) => {
                setAgreedTOS(e.target.checked);
              }}
            >
              <Text as="span" fontSize={12}>
                I have read and agree to the{" "}
                <Link color="teal.500" href={termsOfServiceLink} isExternal>
                  Terms of Service
                </Link>
              </Text>
            </Checkbox>
          </>
        )}
        {formError && (
          <Text color={"red.400"} fontSize={12} mb={2}>
            {formError}
          </Text>
        )}
        <Button
          type="submit"
          variant="accent"
          width="100%"
          isDisabled={busy}
        >
          {isSignup ? "Create Account" : "Login"}
        </Button>
      </form>
      <Divider mt={5} mb={3} />

      {!isSignup && (
        <>
          <Button
            variant="secondary"
            width="100%"
            onClick={() => {
              setMode(MODES.SIGNUP);
            }}
          >
            Sign Up
          </Button>
          <Flex direction="column" align="center" mt={4}>
            <Text fontSize={12}>Forgot password?</Text>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setResetCodeSent(false);
                setMode(MODES.RESET);
              }}
            >
              Reset my password
            </Button>
          </Flex>
        </>
      )}

      {isSignup && (
        <Button
          variant="ghost"
          width="100%"
          mt={3}
          onClick={() => {
            setMode(MODES.LOGIN);
          }}
        >
          Already have an account? Log in
        </Button>
      )}
    </AuthCard>
  );
}

function AuthCard({ title, subtitle, children }) {
  const { colorMode } = useColorMode();
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      p={6}
    >
      <Box
        width="100%"
        maxWidth="420px"
        p={8}
        borderRadius="lg"
        borderWidth="1px"
        bg={colorMode === "dark" ? "customPurple.800" : "white"}
      >
        <Heading fontSize={22} mb={1}>
          {title}
        </Heading>
        <Text fontSize={13} color="gray" mb={6}>
          {subtitle}
        </Text>
        {children}
        {/* This gate presupposes a mode was picked already, so the way out of
            it has to live here: Local mode needs no account at all. */}
        <Divider my={5} />
        <SwitchUserModeFooter />
      </Box>
    </Flex>
  );
}

function SwitchUserModeFooter() {
  const dispatch = useDispatch();
  return (
    <Flex direction="column" align="center">
      <Text fontSize={12} color="gray" textAlign="center">
        AnkiBrain can also run the AI on this computer, with your own API key
        and no account.
      </Text>
      <Button
        variant="ghost"
        size="sm"
        mt={1}
        onClick={() => dispatch(setUserModeSelectorOpen(true))}
      >
        Use a different mode
      </Button>
    </Flex>
  );
}
