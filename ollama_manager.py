import requests

DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"

def get_ollama_models(server_url):
    """
    Fetches the available Ollama models from the Ollama API.
    Returns a list of models including info such as name, size, parameter count etc.
    """
    try:
        res = requests.get(f'{server_url}/api/tags').json()
        return res['models']
    except requests.exceptions.RequestException as e:
        print(f"Error fetching Ollama models: {e}") #TODO: Should surface this error to the user
        return []