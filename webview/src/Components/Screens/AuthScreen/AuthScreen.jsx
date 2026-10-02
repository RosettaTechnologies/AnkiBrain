import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { IonButton, IonCheckbox, IonInput, IonSpinner } from "@ionic/react";
import "./AuthScreen.css";
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
import { errorToast, infoToast, successToast } from "../../../api/toast";

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
    if (!email || !password) {
      infoToast("Missing details", "Enter your email and password.");
      return;
    }
    run(async () => {
      // On success, login() sets the user in the store and the gate opens.
      await login(email, password);
    });
  }

  function handleSignup(e) {
    e.preventDefault();
    if (!email || !password) {
      infoToast("Missing details", "Enter an email and password.");
      return;
    }
    if (password !== confirmPassword) {
      errorToast(
        "Passwords do not match",
        "Make sure your password and password confirmation match."
      );
      return;
    }
    if (!agreedPP || !agreedTOS) {
      infoToast(
        "Info",
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
    if (!verificationCode) {
      infoToast("Missing code", "Enter the verification code from your email.");
      return;
    }
    run(async () => {
      await verifyEmail(verificationCode, user.accessToken);
    });
  }

  function handleRequestResetCode(e) {
    e.preventDefault();
    if (!email) {
      infoToast("Missing email", "Enter the email address for your account.");
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
    if (!resetCode || !newPassword) {
      infoToast(
        "Missing details",
        "Enter the verification code and choose a new password."
      );
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
        <div className="AuthScreen-center">
          <IonSpinner name="circular" />
        </div>
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
          <IonInput
            className="AuthScreen-input"
            fill="solid"
            placeholder="Verification code..."
            value={verificationCode}
            onIonInput={(e) => {
              setVerificationCode(e.detail.value || "");
            }}
          />
          <IonButton
            type="submit"
            color="accent"
            expand="block"
            disabled={busy}
          >
            Validate
          </IonButton>
        </form>
        <p className="AuthScreen-hint">
          If you don&apos;t see the code, <b>check your spam folder.</b>
        </p>
        <IonButton
          className="AuthScreen-secondaryBtn"
          color="light"
          expand="block"
          disabled={busy}
          onClick={() => {
            run(async () => {
              await resendVerificationCode(user.accessToken);
            });
          }}
        >
          Resend verification code to my email
        </IonButton>
        <hr className="AuthScreen-divider" />
        <IonButton
          fill="clear"
          expand="block"
          onClick={handleLogoutFromVerify}
        >
          Log in with a different account
        </IonButton>
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
            <IonInput
              className="AuthScreen-input"
              fill="solid"
              type="email"
              placeholder="Email address"
              value={email}
              onIonInput={(e) => {
                setEmail(e.detail.value || "");
              }}
            />
            <IonButton
              type="submit"
              color="accent"
              expand="block"
              disabled={busy}
            >
              Send verification code
            </IonButton>
          </form>
        ) : (
          <form onSubmit={handleConfirmReset}>
            <IonInput
              className="AuthScreen-input"
              fill="solid"
              placeholder="Verification code"
              value={resetCode}
              onIonInput={(e) => {
                setResetCode(e.detail.value || "");
              }}
            />
            <IonInput
              className="AuthScreen-input"
              fill="solid"
              type="password"
              placeholder="New password"
              value={newPassword}
              onIonInput={(e) => {
                setNewPassword(e.detail.value || "");
              }}
            />
            <IonButton
              type="submit"
              color="accent"
              expand="block"
              disabled={busy}
            >
              Reset password
            </IonButton>
          </form>
        )}
        <IonButton
          className="AuthScreen-secondaryBtn"
          fill="clear"
          expand="block"
          onClick={() => {
            setResetCodeSent(false);
            setResetCode("");
            setNewPassword("");
            setMode(MODES.LOGIN);
          }}
        >
          Back to login
        </IonButton>
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
        <label className="AuthScreen-label" htmlFor="auth-email">
          Email address
        </label>
        <IonInput
          className="AuthScreen-input"
          fill="solid"
          id="auth-email"
          type="email"
          value={email}
          onIonInput={(e) => {
            setEmail(e.detail.value || "");
          }}
        />
        <label className="AuthScreen-label" htmlFor="auth-password">
          Password
        </label>
        <IonInput
          className="AuthScreen-input"
          fill="solid"
          id="auth-password"
          type="password"
          value={password}
          onIonInput={(e) => {
            setPassword(e.detail.value || "");
          }}
        />
        {isSignup && (
          <>
            <label className="AuthScreen-label" htmlFor="auth-confirm">
              Confirm password
            </label>
            <IonInput
              className="AuthScreen-input"
              fill="solid"
              id="auth-confirm"
              type="password"
              value={confirmPassword}
              onIonInput={(e) => {
                setConfirmPassword(e.detail.value || "");
              }}
            />
            <IonCheckbox
              className="AuthScreen-checkbox"
              checked={agreedPP}
              onIonChange={(e) => {
                setAgreedPP(e.detail.checked);
              }}
            >
              <span className="AuthScreen-checkboxLabel">
                I have read and agree to the{" "}
                <a
                  className="AuthScreen-link"
                  href={privacyPolicyLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Privacy Policy
                </a>
              </span>
            </IonCheckbox>
            <IonCheckbox
              className="AuthScreen-checkbox"
              checked={agreedTOS}
              onIonChange={(e) => {
                setAgreedTOS(e.detail.checked);
              }}
            >
              <span className="AuthScreen-checkboxLabel">
                I have read and agree to the{" "}
                <a
                  className="AuthScreen-link"
                  href={termsOfServiceLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Terms of Service
                </a>
              </span>
            </IonCheckbox>
          </>
        )}
        <IonButton type="submit" color="accent" expand="block" disabled={busy}>
          {isSignup ? "Create Account" : "Login"}
        </IonButton>
      </form>

      <hr className="AuthScreen-divider" />

      {!isSignup && (
        <>
          <IonButton color="secondary" expand="block" onClick={() => setMode(MODES.SIGNUP)}>
            Sign Up
          </IonButton>
          <div className="AuthScreen-forgot">
            <span className="AuthScreen-hint">Forgot password?</span>
            <IonButton
              fill="clear"
              size="small"
              onClick={() => {
                setResetCodeSent(false);
                setMode(MODES.RESET);
              }}
            >
              Reset my password
            </IonButton>
          </div>
        </>
      )}

      {isSignup && (
        <IonButton
          className="AuthScreen-secondaryBtn"
          fill="clear"
          expand="block"
          onClick={() => {
            setMode(MODES.LOGIN);
          }}
        >
          Already have an account? Log in
        </IonButton>
      )}
    </AuthCard>
  );
}

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="AuthScreen">
      <div className="AuthScreen-card">
        <h2 className="AuthScreen-title">{title}</h2>
        <p className="AuthScreen-subtitle">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
