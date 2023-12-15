import {asendPythonCommand} from "../../PythonBridge";
import {InterprocessCommand} from "../../PythonBridge/InterprocessCommand";
import {store} from "../../redux";
import {infoToast} from "../../toast";
import {_fetch} from "./fetch";
import {getAPIEndpoints} from "./index";

// Url can be /document or /document/split
export function uploadDocument(path, url, accessToken) {
  // Sends a network request from python layer, it's slightly different, so we don't use _fetch.
  if (!store.getState().user.value) {
    infoToast("Log in required", "Please log in first.");
    return;
  }

  if (process.env.REACT_APP_ENV === "STANDALONE") {
    // todo
  } else {
    return asendPythonCommand(InterprocessCommand.UPLOAD_DOCUMENT, {
      path,
      url,
      accessToken,
    });
  }
}

/**
 * Sends DELETE request to /document to DELETE ALL documents.
 * @param accessToken
 * @returns {Promise<void>}
 */
export async function deleteDocumentEndpoint(accessToken) {
  return _fetch(getAPIEndpoints().DOCUMENT, {
    method: "DELETE",
    body: { accessToken },
  });
}

export async function postCreateCheckoutSession(accessToken) {
  return _fetch(getAPIEndpoints().CREATE_CHECKOUT_SESSION, {
    method: "POST",
    body: { accessToken },
  });
}
