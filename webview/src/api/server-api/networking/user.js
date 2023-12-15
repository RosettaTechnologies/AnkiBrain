import { _fetch } from "./fetch";
import { getAPIEndpoints } from "./index";

export function getUser(accessToken) {
  return _fetch(getAPIEndpoints().USER, {
    method: "get",
    body: { accessToken },
  });
}

export function postLogin(email, password) {
  return _fetch(getAPIEndpoints().USER_LOGIN, {
    method: "POST",
    body: { email, password },
  });
}

export function postUser(email, password) {
  return _fetch(getAPIEndpoints().USER, {
    method: "POST",
    body: { email, password },
  });
}

export function postVerifyEmail(verificationCode, accessToken) {
  return _fetch(getAPIEndpoints().USER_VERIFY_EMAIL, {
    method: "POST",
    body: { verificationCode, accessToken },
  });
}

export function postResendVerificationEmail(accessToken) {
  return _fetch(getAPIEndpoints().USER_RESEND_VERIFICATION_EMAIL, {
    method: "POST",
    body: { accessToken },
  });
}

export function postRequestPasswordResetCode(email) {
  return _fetch(getAPIEndpoints().USER_PASSWORD_RESET_CODE, {
    method: "POST",
    body: { email },
  });
}

export function postPasswordReset(email, newPassword, verificationCode) {
  return _fetch(getAPIEndpoints().USER_PASSWORD_RESET, {
    method: "POST",
    body: { email, password: newPassword, verificationCode },
  });
}
