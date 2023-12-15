import {
  postLogin,
  postResendVerificationEmail,
  postUser,
  postVerifyEmail,
} from "./server-api/networking/user";
import {
  setEmailVerified,
  setShowLoginModal,
  setUser as setUserInStore,
  store,
} from "./redux";
import { successToast } from "./toast";
import { pyEditSetting } from "./PythonBridge/senders/pyEditSetting";

export async function setUser(user) {
  store.dispatch(setUserInStore(user));
  await pyEditSetting("user", user);
}

export async function login(email, password) {
  const res = await postLogin(email, password);
  if (res.status === "success") {
    const user = res.data.user;
    await setUser(user);
    successToast("Logged In", "You have been logged in to AnkiBrain.");
    store.dispatch(setShowLoginModal(false));

    return user;
  }
}

export function logout() {
  return setUser(null);
}

export async function signup(email, password) {
  const res = await postUser(email, password);
  if (res.status === "success") {
    successToast(
      "Account Created",
      "Your AnkiBrain account has been created. Check your email for a verification code."
    );

    store.dispatch(setShowLoginModal(false));
    await login(email, password);
  }
}

export async function verifyEmail(verificationCode, accessToken) {
  const res = await postVerifyEmail(verificationCode, accessToken);
  if (res.status === "success") {
    successToast("Email Verified", "Your email address has been verified.");
    store.dispatch(setEmailVerified());
  }
}

export async function resendVerificationCode(accessToken) {
  const res = await postResendVerificationEmail(accessToken);
  if (res.status === "success") {
    successToast(
      "Verification Code Sent",
      "A new verification code has been sent to your email."
    );
  }
}

export function isLocalMode() {
  return store.getState().userMode.value === "LOCAL";
}
