import {_fetch} from "./fetch";
import {getAPIEndpoints} from "./index";

export function postCreateSubscriptionCheckoutSession(accessToken, tier) {
  return _fetch(getAPIEndpoints().CREATE_SUBSCRIPTION_CHECKOUT_SESSION, {
    method: "POST",
    body: {accessToken, tier},
  });
}

export function postCreateCustomerPortalSession(accessToken) {
  return _fetch(getAPIEndpoints().CREATE_CUSTOMER_PORTAL_SESSION, {
    method: "POST",
    body: {accessToken},
  });
}

export function postChangeSubscription(accessToken, tier) {
  return _fetch(getAPIEndpoints().CHANGE_SUBSCRIPTION, {
    method: "POST",
    body: {accessToken, tier},
  });
}

export function postCancelSubscription(accessToken) {
  return _fetch(getAPIEndpoints().CANCEL_SUBSCRIPTION, {
    method: "POST",
    body: {accessToken},
  });
}

export function postResumeSubscription(accessToken) {
  return _fetch(getAPIEndpoints().RESUME_SUBSCRIPTION, {
    method: "POST",
    body: {accessToken},
  });
}
