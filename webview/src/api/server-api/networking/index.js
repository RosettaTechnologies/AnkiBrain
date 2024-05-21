import { isDevMode } from "../../devMode";
import { store } from "../../redux";
import { setApiBaseUrl } from "../../redux/slices/apiBaseUrl";

export let DEV_SERVER_URL = "https://www.dev.anki.rankmd.org";
export let PROD_SERVER_URL = "https://anki.rankmd.org";

export function setupServerAPI() {
  let API_BASE_URL;

  if (isDevMode()) {
    API_BASE_URL = DEV_SERVER_URL;
  } else {
    API_BASE_URL = PROD_SERVER_URL;
  }

  store.dispatch(setApiBaseUrl(API_BASE_URL));
}

export function getAPIEndpoints() {
  const API_BASE_URL = store.getState().apiBaseUrl.value;
  return {
    CHAT: API_BASE_URL + "/chat",
    DOCUMENT: API_BASE_URL + "/document",
    DOCUMENT_SPLIT: API_BASE_URL + "/document/split",
    USER: API_BASE_URL + "/user",
    USER_LOGIN: API_BASE_URL + "/user/login",
    USER_VERIFY_EMAIL: API_BASE_URL + "/user/verifyEmail",
    USER_RESEND_VERIFICATION_EMAIL:
      API_BASE_URL + "/user/resendVerificationEmail",
    USER_PASSWORD_RESET_CODE: API_BASE_URL + "/user/password-reset-code",
    USER_PASSWORD_RESET: API_BASE_URL + "/user/password-reset",
    CREATE_CHECKOUT_SESSION: `${API_BASE_URL}/create-checkout-session`,
    PRIVACY_POLICY: `${API_BASE_URL}/privacy-policy.html`,
    TERMS_OF_SERVICE: `${API_BASE_URL}/terms-of-service.html`,
  };
}
