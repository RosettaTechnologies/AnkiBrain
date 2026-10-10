import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/**
 * Check an OpenAI-compatible endpoint with one GET on its /models route and
 * report two verdicts: is the URL a working endpoint, and does it accept the
 * key? No chat request is sent, so a check never costs tokens, and an endpoint
 * without a /models route is reported as reachable with an unverified key
 * rather than as a failure. A blank apiKey means "use the saved key"; a blank
 * baseUrl means OpenAI's default endpoint; a null extraHeaders means "use the
 * saved headers".
 * Resolves with {ok, status, url_message, models, key: {status, message}}.
 */
export function pyTestOpenAIConnection({ apiKey, baseUrl, extraHeaders }) {
  return asendPythonCommand(IC.TEST_OPENAI_CONNECTION, {
    apiKey,
    baseUrl,
    extraHeaders,
  });
}

/**
 * Persist the API key (user_files/.env), the base URL and the extra headers
 * (settings.json); python restarts the local engine when it is installed and in
 * sync. Resolves with {ok}.
 */
export function pySetOpenAIConfig({ apiKey, baseUrl, extraHeaders }) {
  return asendPythonCommand(IC.SET_OPENAI_CONFIG, {
    apiKey,
    baseUrl,
    extraHeaders,
  });
}
