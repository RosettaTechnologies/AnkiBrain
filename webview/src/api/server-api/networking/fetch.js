import {errorToast, infoToast} from "../../toast";
import {asendPythonCommand} from "../../PythonBridge";
import {InterprocessCommand} from "../../PythonBridge/InterprocessCommand";
import {store} from "../../redux";
import {setLockCheckoutSession} from "../../redux/slices/lockCheckoutSession";

/**
 * Reimplemented fetch function to send async network requests via the python layer.
 * @param url
 * @param options
 * @returns {Promise<unknown>}
 * @private
 */
export async function _fetch(url, options) {
  store.dispatch(setLockCheckoutSession(true));

  let standalone = process.env.REACT_APP_ENV === "STANDALONE";
  try {
    let verb = options.method;
    let data = options.body ? options.body : {};
    let res = null;

    if (standalone) {
      res = await fetch(url, {
        ...options,
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });
    } else {
      res = await asendPythonCommand(InterprocessCommand.NETWORK_REQUEST, {
        url,
        verb,
        data,
      });
    }

    if (!res) {
      errorToast("Request error", res);
      return res;
    }

    if (standalone) {
      res = await res.json();
    }

    if (res.status === "fail") {
      infoToast("Request failed", res.message ? res.message : "");
    } else if (res.status === "error") {
      errorToast("Request error", res.message ? res.message : "");
    }

    return res;
  } catch (error) {
    errorToast("Request error", error);
  } finally {
    store.dispatch(setLockCheckoutSession(false));
  }
}
