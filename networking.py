import json
import os.path
from typing import Optional

import httpx
from aqt import mw


# TODO

#Check enviornment mode:

def is_prod_env():
    return not is_dev_env()


def is_dev_env():
    return mw.settingsManager.settings['devMode']

#Define function "fetch" which performs different HTTP requests (GET, POST, DELETE) asynchronously. POST function uses JSON format, 
#all responses return in JSON

async def fetch(url, verb, data):
    headers = {'Content-Type': 'application/json'}
    try:
        async with httpx.AsyncClient(timeout=60, verify=False if is_dev_env() else True) as client:
            if verb.lower() == 'get':
                res = await client.get(url, params=data, headers=headers)
            elif verb.lower() == 'post':
                res = await client.post(url, data=json.dumps(data), headers=headers)
            elif verb.lower() == 'delete':
                res = await client.delete(url, params=data, headers=headers)
            else:
                raise ValueError(f'Unsupported HTTP verb: {verb.lower()}')

            #res.raise_for_status() #raises error for HTTP status codes (ex. 4xx or 5xx)
            #print(res)
            return res.json()
    except Exception as exc:
        print(exc)
        raise exc

#The function "postDocument" reads in a document as binary data then uploads that data to a specified URL using a POST request.
#Response is returned as JSON. 

async def postDocument(file_path: str, url, accessToken: str):
    headers = {'Authorization': f'Bearer {accessToken}'}
    filename = os.path.basename(file_path)

    with open(file_path, 'rb') as f:
        file_data = f.read()

    files = {'file': (filename, file_data)}

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=3600, pool=3600, read=3600, write=3600)) as client:
        res = await client.post(url, headers=headers, files=files)
        res.raise_for_status() 
        res = res.json()
        return res


async def postOcclusionImage(url, file_path, accessToken, fields=None):
    """
    Upload one image to the AnkiBrain server's occlusion endpoint and return
    its JSON response (vision-suggested occlusion shapes). Used by server
    mode; the bytes never cross the JS<->Python bridge.
    """
    headers = {'Authorization': f'Bearer {accessToken}'}
    filename = os.path.basename(file_path)

    with open(file_path, 'rb') as f:
        file_data = f.read()

    files = {'file': (filename, file_data)}
    data = {key: str(value) for key, value in (fields or {}).items()}

    async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=120, pool=120, read=300, write=300),
            verify=False if is_dev_env() else True) as client:
        res = await client.post(url, headers=headers, files=files, data=data)
        res.raise_for_status()
        return res.json()


OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1'
# AnkiBrain identifies itself instead of looking like a generic HTTP library;
# gateways that route coding-agent traffic (opencode Go) ask for that, and a
# user header of the same name overrides it. Mirrored in ChatAI/llm_config.py.
OPENAI_USER_AGENT = 'AnkiBrain'


def openai_request_headers(api_key: Optional[str], extra_headers: Optional[dict] = None) -> dict:
    """
    Identification + user headers + auth, exactly as the engine sends them.
    AnkiBrain always identifies itself and always sends the install's stable
    session id, so header-routing gateways (opencode Go) work with no setup;
    a same-named entry in `extra_headers` overrides either one.
    """
    version = ''
    session_id = ''
    try:
        settings = mw.settingsManager.settings
        version = str(settings.get('currentVersion') or '')
        session_id = str(settings.get('openaiSessionId') or '').strip()
    except Exception:
        pass
    headers = {'User-Agent': f'{OPENAI_USER_AGENT}/{version}' if version else OPENAI_USER_AGENT}
    if session_id:
        headers['x-opencode-session'] = session_id
    if isinstance(extra_headers, dict):
        headers.update({str(k): str(v) for k, v in extra_headers.items() if str(k).strip()})
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    return headers


def _openai_error_message(res) -> str:
    """The endpoint's own error text, unwrapped from an OpenAI-style {'error': {...}} body."""
    try:
        payload = res.json()
    except Exception:
        return res.text[:200]
    err = payload.get('error') if isinstance(payload, dict) else None
    if isinstance(err, dict):
        return str(err.get('message') or err)
    if isinstance(err, str):
        return err
    return res.text[:200]


async def check_openai_endpoint(api_key: Optional[str], base_url: Optional[str],
                                extra_headers: Optional[dict] = None) -> dict:
    """
    One request, two verdicts: is the base URL a working endpoint, and does it
    accept the key? Nothing about the provider is assumed beyond the
    OpenAI-compatible /models route - an endpoint without that route still
    passes the URL check and its key is reported as unverified rather than
    wrong. No chat request is ever sent, so a test never costs tokens.

    Returns {'ok': bool, 'status': int|None, 'url_message': str,
             'models': [id, ...], 'key': {'status', 'message'}}.
    ok means "the URL answered HTTP". models is empty unless the endpoint listed
    them. key.status is 'accepted' | 'rejected' | 'unverified' | 'not-attempted'.
    """
    base = (base_url or '').strip().rstrip('/') or OPENAI_DEFAULT_BASE_URL
    url = f'{base}/models'
    headers = openai_request_headers(api_key, extra_headers)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(url, headers=headers)
    except Exception as exc:
        return {'ok': False, 'status': None, 'models': [],
                'url_message': f'Could not reach {url}: {exc}',
                'key': {'status': 'not-attempted',
                        'message': 'Not tested - the URL did not answer.'}}
    code = res.status_code
    models = []
    if code == 200:
        try:
            payload = res.json()
            models = sorted({m['id'] for m in payload.get('data', [])
                             if isinstance(m, dict) and isinstance(m.get('id'), str)})
        except Exception:
            models = []
        url_message = (f'Reachable (HTTP 200) - {len(models)} models listed.' if models
                       else 'Reachable (HTTP 200) - the response had no model list.')
    elif code in (401, 403):
        url_message = f'Reachable (HTTP {code}) - the endpoint requires an API key.'
    elif code in (404, 405):
        url_message = f'Reachable (HTTP {code}) - no /models route at this URL.'
    else:
        url_message = f'Reachable (HTTP {code}).'
    if not api_key:
        key = {'status': 'not-attempted', 'message': 'No API key entered.'}
    elif code == 200:
        key = {'status': 'accepted',
               'message': 'The endpoint returned its model list with this key.'}
    elif code in (401, 403):
        key = {'status': 'rejected', 'message': _openai_error_message(res)}
    elif code in (404, 405):
        key = {'status': 'unverified',
               'message': 'This endpoint has no /models route, so the key could not be checked.'}
    elif code == 429:
        key = {'status': 'unverified',
               'message': 'Rate limited (HTTP 429), so the key could not be checked.'}
    else:
        key = {'status': 'unverified', 'message': f'HTTP {code}: {_openai_error_message(res)}'}
    return {'ok': True, 'status': code, 'url_message': url_message,
            'models': models, 'key': key}
