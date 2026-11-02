import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

// Asks Python to open an http(s) URL in the system browser. Returns true when
// the launch is believed to have succeeded; false lets callers keep a fallback.
export async function pyOpenUrl(url) {
  if (!url) return false;
  try {
    const res = await asendPythonCommand(IC.OPEN_URL, { url });
    // STANDALONE returns true; the Python bridge returns {opened}.
    return res === true || !!(res && res.opened);
  } catch (e) {
    return false;
  }
}
