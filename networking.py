import json
import os.path

import httpx
from aqt import mw


# TODO
def is_prod_env():
    return not is_dev_env()


def is_dev_env():
    return mw.settingsManager.settings['devMode']


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

            res.raise_for_status()
            return res.json()
    except Exception as exc:
        print(exc)
        raise exc


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
