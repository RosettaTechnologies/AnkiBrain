"""Shared OpenAI-compatible endpoint config for the ChatAI subprocess.

The Anki-side Settings screen writes `openaiBaseUrl` and `openaiExtraHeaders`
into settings.json; the API key continues to live in user_files/.env as
OPENAI_API_KEY. Every OpenAI client built in this subprocess passes base_url and
default_headers explicitly, so a self-hosted, proxied or header-routing endpoint
works.
"""
import json
from os import path

user_data_dir = path.join(path.abspath(path.dirname(__file__)), '..', 'user_files')
settings_path = path.join(user_data_dir, 'settings.json')

# AnkiBrain identifies itself instead of sending the SDK's own user agent:
# gateways that route coding-agent traffic (opencode Go) ask clients not to look
# like a generic HTTP library. A user header of the same name overrides it.
USER_AGENT = 'AnkiBrain'


def _settings():
    try:
        with open(settings_path, 'r') as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def get_openai_base_url():
    """settings.json `openaiBaseUrl`, or None to use the SDK/OpenAI default."""
    url = (_settings().get('openaiBaseUrl') or '')
    url = url.strip() if isinstance(url, str) else ''
    # Same normalization as the Anki-side probe, so a saved URL with a trailing
    # slash produces byte-identical requests in both paths.
    return url.rstrip('/') or None


def get_openai_headers():
    """
    Headers for every request this subprocess makes to the endpoint: AnkiBrain's
    own User-Agent, the install's stable session id as x-opencode-session, and
    the user's `openaiExtraHeaders` merged on top (a same-named entry there
    overrides either default).
    """
    data = _settings()
    version = str(data.get('currentVersion') or '').strip()
    session_id = str(data.get('openaiSessionId') or '').strip()
    headers = {'User-Agent': f'{USER_AGENT}/{version}' if version else USER_AGENT}
    if session_id:
        headers['x-opencode-session'] = session_id
    extra = data.get('openaiExtraHeaders')
    if isinstance(extra, dict):
        headers.update({str(k): str(v) for k, v in extra.items() if str(k).strip()})
    return headers


def _positive_number(value):
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError:
            return 0.0
    else:
        return 0.0
    return number if number > 0 else 0.0


def get_cost_prices():
    """
    Optional `(input, output)` price override for the session cost tracker, in
    USD per 1M tokens. Settings → Basic stores `openaiInputCostPer1M` /
    `openaiOutputCostPer1M`; 0 (or missing) means "unset", and the tracker then
    uses whatever cost the endpoint reports in the response usage.

    Read per call, not cached at startup: a price edit applies to the next
    request without restarting the engine.
    """
    data = _settings()
    return (
        _positive_number(data.get('openaiInputCostPer1M')),
        _positive_number(data.get('openaiOutputCostPer1M')),
    )
