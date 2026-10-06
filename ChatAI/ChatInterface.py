from abc import ABC, abstractmethod
from typing import Tuple, Optional, List, TypedDict
import base64
import json
import os
import re

from langchain.schema import Document


def extract_json_array(s):
    start = s.find('[')
    end = s.rfind(']') + 1  # +1 to include the bracket itself
    if start != -1 and end != -1:
        return s[start:end]
    else:
        return None


# Card-generation requests for image-bearing batches send chunk-labeled
# text ("[Chunk N]" markers, see webview batching.js). When labels are
# present the model is asked to cite the source chunk of every card so
# images attach per-card instead of to the whole batch.
CHUNK_INSTRUCTION = (
    'The text above is divided into numbered chunks marked [Chunk 0], '
    '[Chunk 1], and so on. For EVERY card you output, include a "chunk" '
    'field set to the integer number of the chunk whose content the card '
    'is drawn from. '
)


def _is_chunk_labeled(text):
    return bool(re.search(r'\[Chunk \d+\]', text or ''))


# Vision-capable model prefixes. The legacy models cannot read images, so the
# occlusion suggestion flow refuses them with a clear message instead of
# letting the API return an opaque error.
VISION_MODEL_PREFIXES = ('gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna')

OCCLUSION_IMAGE_MIME_BY_EXT = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
}

# The model must answer with regions as fractions of the image size, which is
# exactly what Anki's image-occlusion field stores.
OCCLUSION_PROMPT = '''You are helping create an Anki "image occlusion" flashcard from the image below.
Identify the labeled structures/parts that are worth hiding for study (for example organ names on an anatomy diagram, labels on a chart, parts of a device).

Return ONLY a JSON object with this exact structure:
{
  "header": "short title or question shown above the image",
  "backExtra": "optional one-line explanation or list of the labels; may be empty",
  "regions": [
    {"label": "left ventricle", "shape": "rect", "left": 0.12, "top": 0.31, "width": 0.09, "height": 0.07}
  ]
}

Rules:
- "left"/"top" are the top-left corner of the region; "width"/"height" its size.
- All coordinates are fractions of the image size from 0.0 to 1.0 (origin = top-left corner).
- Provide 3 to 10 regions, and only clearly meaningful labeled parts. Do not overlap regions.
- Prefer "rect" boxes that tightly cover the label text or the structure itself.
- If the image has no meaningful labeled structures, return {"regions": []}.
- LANGUAGE: {language_instruction}
Do not output any text besides the JSON object.'''


class BadOutputGenerateCardsException(Exception):
    def __init__(self, data):
        super().__init__()
        self.data = data


class ChatInterface(ABC):

    @abstractmethod
    def clear_memory(self):
        pass

    @abstractmethod
    def human_message(self, query: str) -> Tuple[str, Optional[List[Document]]]:
        pass

    def single_query_resets_memory(self, query: str):
        self.clear_memory()
        response, _ = self.human_message(query)
        self.clear_memory()

        return response

    class ExplainTopicOptions(TypedDict):
        level_of_detail: str
        level_of_expertise: str

    def explain_topic(self, topic: str, options: ExplainTopicOptions = None) -> str:
        if options is None:
            options = {'custom_prompt': '', 'level_of_detail': 'EXTREME', 'level_of_expertise': 'EXPERT', 'language': 'English'}

        custom_prompt = options['custom_prompt']
        level_of_detail = options['level_of_detail']
        level_of_expertise = options['level_of_expertise']
        language = options['language']
        query = f'''
                    Explain X using the following parameters: 
                    X = {topic}
                    LEVEL OF DETAIL = {level_of_detail}
                    LEVEL OF EXPERTISE = {level_of_expertise}
                    LANGUAGE = {language}
                    
                    {'When finished, make sure your response is in ' +
                     language + ' only.' if language is not 'English' else ''}
                     
                     {custom_prompt}
                    '''

        explanation = self.single_query_resets_memory(query)
        return explanation

    class GenerateCardsOptions(TypedDict):
        type: str

    def generate_cards(self, text: str, options: GenerateCardsOptions = None) -> str:
        if options is None:
            options = {'type': 'basic', 'language': 'English'}

        custom_prompt = options['custom_prompt']
        card_type = options['type']
        language = options['language']

        chunked = _is_chunk_labeled(text)
        chunk_instruction = CHUNK_INSTRUCTION if chunked else ''
        chunk_field_0 = ',\n              "chunk": 0' if chunked else ''
        chunk_field_1 = ',\n              "chunk": 1' if chunked else ''
        chunk_field_2 = ',\n              "chunk": 2' if chunked else ''

        query = ''
        if card_type == 'basic':
            query = f'''
            Please read the {language} text below in quotes:
            
            "{text}"
            
            From the text above, I want you to create flash cards in {language}. Output in JSON format, using the following as a strict template for the format. 
            
            [
            {{
              "front": "This is an example of the front of a card generated by ChatGPT to query the material. You can be creative about the best way to ask a question.", 
              "back": "This is the back of the card that is the answer to the front."{chunk_field_0} 
            }}, 
            {{
              "front": "This is the front of another card.",
              "back": "This is the back of another card."{chunk_field_1} 
            }}
            ] 
            
            {chunk_instruction}{"The example given above is in English, but remember to translate the final cards into " +
             language + ". The front text and the back text should be in " + language +
             "!. The names of the JSON fields themselves ('front' and 'back') should remain in English."
            if language is not 'English' else ''
            }
            
            {custom_prompt}
            
            Do not output any other text besides JSON. Begin output now as the template above.
            '''
        elif card_type == 'cloze':
            query = f'''
            Please read the {language} text below in quotes.
            
            "{text}"
            
            From the text above, I want you to create flash cards in ${language}. 
            These are special cards where you omit key words or phrases. 
            You can use asterisks *like this* to indicate that a word or phrase 
            should be hidden for whoever is studying the card. 
            You can create multiple omissions per card. 
            Please decide to hide key words or phrases depending on how important they are to the context. 
            If a word or phrase is very important, you should definitely hide it using *this notation*!
            
            Output in JSON format, using the following as a strict template for your response format:
            [ 
            {{
              "text": "This is an example of a *flash card* made by you."{chunk_field_0} 
            }}, 
            {{
              "text": "This is the *second* flash *card*, this time containing *three deletions*."{chunk_field_1} 
            }},
            {{
              "text": "Please omit key *words* or *an entire phrase* using asterisks."{chunk_field_2}
            }}
            ] 
            
            {chunk_instruction}Make each card relatively small - that means your "text" field should not be more than one sentence.
            
            {'The example given above is in English, but remember to translate the final cards into ' +
             language + "! The name of the JSON field itself ('text') should remain in English."
            if language is not 'English' else ''
            }
            
            {custom_prompt}
            
            Do not output any other text besides JSON. Begin output now following the template above.
            '''
        else:
            raise Exception('Invalid card type')

        cards_raw_str = self.single_query_resets_memory(query).strip()
        cards_raw_str = extract_json_array(cards_raw_str)  # ???
        return cards_raw_str
        # try:
        #     cards = json.loads(cards_json_str)
        #     for card in cards:
        #         card['tags'] = []
        #         card['type'] = card_type
        #     return cards
        # except Exception as e:
        #     raise BadOutputGenerateCardsException({'message': 'Malformed JSON output', 'json': cards_json_str})

    def generate_occlusion_shapes(self, image_path: str, context: str = '',
                                  language: str = 'English',
                                  model: str = 'gpt-5.6-luna') -> dict:
        """
        Vision pass for image-occlusion cards: ask the configured model for
        the labeled regions of a diagram/figure and return
        {'shapes': [...], 'header': str, 'backExtra': str} ready for the
        webview's occlusion editor.

        Coordinates come back normalized (fractions of the image size), which
        is exactly what Anki's image-occlusion field stores. Regions are
        clamped/validated here so malformed model output can never produce a
        broken note.
        """
        import openai

        if not image_path or not os.path.isfile(image_path):
            raise Exception('The image for this occlusion card is no longer available.')

        if not any(model.startswith(prefix) for prefix in VISION_MODEL_PREFIXES):
            raise Exception(
                'The selected AI model cannot analyze images. '
                'Choose a GPT-5.6 model in Settings to use AI occlusion suggestions.')

        with open(image_path, 'rb') as f:
            image_bytes = f.read()

        mime = OCCLUSION_IMAGE_MIME_BY_EXT.get(
            os.path.splitext(image_path)[1].lower().lstrip('.'), 'image/png')
        b64 = base64.b64encode(image_bytes).decode('ascii')

        language_instruction = (
            'Write the header, backExtra and labels in English.'
            if language == 'English'
            else f'Write the header, backExtra and labels in {language}.'
        )
        prompt = OCCLUSION_PROMPT.replace('{language_instruction}', language_instruction)
        if context:
            prompt += f'\n\nSurrounding document text (for context only):\n"{context[:2000]}"'

        messages = [{
            'role': 'user',
            'content': [
                {'type': 'text', 'text': prompt},
                {'type': 'image_url',
                 'image_url': {'url': f'data:{mime};base64,{b64}'}},
            ],
        }]

        openai.api_key = os.getenv('OPENAI_API_KEY')
        kwargs = {'model': model, 'messages': messages}
        if model.startswith('gpt-5.6'):
            # The GPT-5.6 family rejects temperature/max_tokens.
            kwargs['max_completion_tokens'] = 1500
        else:
            kwargs['temperature'] = 0
            kwargs['max_tokens'] = 1500

        response = openai.ChatCompletion.create(**kwargs)
        text = (response['choices'][0]['message']['content'] or '').strip()
        return self._parse_occlusion_response(text)

    @staticmethod
    def _parse_occlusion_response(text: str) -> dict:
        start = text.find('{')
        end = text.rfind('}')
        if start == -1 or end == -1 or end <= start:
            raise Exception('The AI did not return occlusion data. Try again.')

        try:
            data = json.loads(text[start:end + 1])
        except ValueError:
            raise Exception('The AI returned malformed occlusion data. Try again.')

        shapes = []
        for region in (data.get('regions') or []):
            if not isinstance(region, dict):
                continue
            normalized = ChatInterface._normalize_occlusion_region(region)
            if normalized is not None:
                shapes.append(normalized)

        return {
            'shapes': shapes,
            'header': str(data.get('header') or '').strip()[:200],
            'backExtra': str(data.get('backExtra') or '').strip()[:2000],
        }

    @staticmethod
    def _normalize_occlusion_region(region: dict):
        """
        Validate/clamp one model-proposed region. Returns None when the
        region is unusable (missing/non-numeric/too small/outside bounds).
        """
        def clamp(value):
            try:
                number = float(value)
            except (TypeError, ValueError):
                return None
            if number != number:  # NaN
                return None
            return max(0.0, min(1.0, number))

        label = str(region.get('label') or '').strip()[:80]
        shape = str(region.get('shape') or 'rect').lower()

        if shape == 'ellipse':
            left = clamp(region.get('left'))
            top = clamp(region.get('top'))
            rx = clamp(region.get('rx'))
            ry = clamp(region.get('ry'))
            if None in (left, top, rx, ry):
                return None
            if rx < 0.005 or ry < 0.005:
                return None
            return {'shape': 'ellipse', 'left': left, 'top': top,
                    'rx': rx, 'ry': ry, 'label': label}

        left = clamp(region.get('left'))
        top = clamp(region.get('top'))
        width = clamp(region.get('width'))
        height = clamp(region.get('height'))
        if None in (left, top, width, height):
            return None
        if width < 0.005 or height < 0.005:
            return None

        # Keep the box inside the image even when the model overshoots.
        width = min(width, 1.0 - left)
        height = min(height, 1.0 - top)
        if width <= 0.005 or height <= 0.005:
            return None

        return {'shape': 'rect', 'left': left, 'top': top,
                'width': width, 'height': height, 'label': label}
