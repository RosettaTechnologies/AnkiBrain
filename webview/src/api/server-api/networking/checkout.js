import { _fetch } from "./fetch";
import { getAPIEndpoints } from "./index";

export async function postCreateCheckoutSession(accessToken) {
  return _fetch(getAPIEndpoints().CREATE_CHECKOUT_SESSION, {
    method: "POST",
    body: { accessToken },
  });
}
