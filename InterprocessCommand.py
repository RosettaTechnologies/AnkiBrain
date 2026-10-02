from enum import Enum


class InterprocessCommand(Enum):
    EXPLAIN_TOPIC = 'EXPLAIN_TOPIC'
    DID_EXPLAIN_TOPIC = 'DID_EXPLAIN_TOPIC'

    GENERATE_CARDS = 'GENERATE_CARDS'
    DID_GENERATE_CARDS = 'DID_GENERATE_CARDS'
    FAILED_GENERATE_CARDS = 'FAILED_GENERATE_CARDS'

    ADD_CARDS = 'ADD_CARDS'
    DID_ADD_CARDS = 'DID_ADD_CARDS'

    ASK_CONVERSATION_DOCUMENTS = 'ASK_CONVERSATION_DOCUMENTS'
    DID_ASK_CONVERSATION_DOCUMENTS = 'DID_ASK_CONVERSATION_DOCUMENTS'

    ASK_CONVERSATION_NO_DOCUMENTS = 'ASK_CONVERSATION_NO_DOCUMENTS'
    DID_ASK_CONVERSATION_NO_DOCUMENTS = 'DID_ASK_CONVERSATION_NO_DOCUMENTS'

    CLEAR_CONVERSATION = 'CLEAR_CONVERSATION'
    DID_CLEAR_CONVERSATION = 'DID_CLEAR_CONVERSATION'

    ADD_DOCUMENTS = 'ADD_DOCUMENTS'
    DID_ADD_DOCUMENTS = 'DID_ADD_DOCUMENTS'

    DELETE_ALL_DOCUMENTS = 'DELETE_ALL_DOCUMENTS'
    DID_DELETE_ALL_DOCUMENTS = 'DID_DELETE_ALL_DOCUMENTS'

    OPEN_DOCUMENT_BROWSER = 'OPEN_DOCUMENT_BROWSER'
    DID_CLOSE_DOCUMENT_BROWSER_NO_SELECTIONS = 'DID_CLOSE_DOCUMENT_BROWSER_NO_SELECTIONS'

    DID_SELECT_DOCUMENTS = 'DID_SELECT_DOCUMENTS'

    UPLOAD_DOCUMENT = 'UPLOAD_DOCUMENT'
    DID_UPLOAD_DOCUMENT = 'DID_UPLOAD_DOCUMENT'

    SPLIT_DOCUMENT = 'SPLIT_DOCUMENT'
    DID_SPLIT_DOCUMENT = 'DID_SPLIT_DOCUMENT'

    RESOLVE_IMAGES = 'RESOLVE_IMAGES'
    DID_RESOLVE_IMAGES = 'DID_RESOLVE_IMAGES'

    RESOLVE_AUDIO_IDS = 'RESOLVE_AUDIO_IDS'
    DID_RESOLVE_AUDIO_IDS = 'DID_RESOLVE_AUDIO_IDS'

    # ── Image occlusion (built-in Anki Image Occlusion notetype) ──────────
    # IMPORT_IMAGES {source: 'files'|'clipboard'} -> DID_IMPORT_IMAGES
    #   {images: [{id, url, mediaType}]}; the file/clipboard pickers run on
    #   the UI thread (GUIThreadSignaler) and answer with the commandId.
    # GENERATE_OCCLUSION_SHAPES {imageId, context?, language?, model?,
    #   url?, accessToken?} -> DID_GENERATE_OCCLUSION_SHAPES
    #   {shapes, header, backExtra, user?}. Local mode: the ChatAI subprocess
    #   asks the vision model about the image. Server mode: this process
    #   posts the image to the AnkiBrain server (url/accessToken supplied by
    #   the webview, like UPLOAD_DOCUMENT).
    IMPORT_IMAGES = 'IMPORT_IMAGES'
    DID_IMPORT_IMAGES = 'DID_IMPORT_IMAGES'
    GENERATE_OCCLUSION_SHAPES = 'GENERATE_OCCLUSION_SHAPES'
    DID_GENERATE_OCCLUSION_SHAPES = 'DID_GENERATE_OCCLUSION_SHAPES'

    # ── AnkiBrain Voice (Kokoro TTS) ──────────────────────────────────────
    # SYNTHESIZE_SPEECH {text, voice?, speed?, auto?} -> DID_SYNTHESIZE_SPEECH
    # {path,url,voice,language,...} (promise-style; JS resolves via commandId).
    # auto: null -> ttsAutoDetect setting, false -> speak `voice` verbatim,
    # true -> engine-side language detection picks a fitting voice.
    # TTS_STATUS reports installed/platform/voices.
    # TTS_INSTALL {groups} kicks off the bootstrap: ['core'] full install,
    # ['core','ja'] full install incl. Japanese, ['ja'] adds the pack to an
    # already installed engine. Progress arrives via pushed
    # TTS_INSTALL_PROGRESS events + a final TTS_INSTALL_DONE (no commandId —
    # installs outlive any single request).
    SYNTHESIZE_SPEECH = 'SYNTHESIZE_SPEECH'
    DID_SYNTHESIZE_SPEECH = 'DID_SYNTHESIZE_SPEECH'

    TTS_STATUS = 'TTS_STATUS'
    DID_TTS_STATUS = 'DID_TTS_STATUS'

    TTS_INSTALL = 'TTS_INSTALL'
    DID_TTS_INSTALL = 'DID_TTS_INSTALL'          # {started: bool} ack
    TTS_INSTALL_PROGRESS = 'TTS_INSTALL_PROGRESS'  # push: bootstrap stage event
    TTS_INSTALL_DONE = 'TTS_INSTALL_DONE'          # push: {ok, error?}
    # TTS_CANCEL_INSTALL {preserveCore?}: cancel + join the bootstrap worker;
    # unless preserveCore (the ja add-on flow), also stop the engine and
    # delete the whole partial tree.
    TTS_CANCEL_INSTALL = 'TTS_CANCEL_INSTALL'

    TTS_UNINSTALL = 'TTS_UNINSTALL'
    # DID acks {ok, error?} (promise-style): the engine subprocess is stopped
    # first, then the whole data tree is deleted on a worker thread — a venv
    # is tens of thousands of files and must not block the Qt/UI loop.
    DID_TTS_UNINSTALL = 'DID_TTS_UNINSTALL'

    ADD_TTS_AUDIO = 'ADD_TTS_AUDIO'  # python-initiated speak of card selection

    # Card audio (review-screen workflow): JS enqueues
    # GENERATE_CARD_AUDIO {items:[{uid, field, text, isCloze}]}; each finished
    # clip is pushed as CARD_AUDIO_RESULT, then the batch settles with a
    # DID_GENERATE_CARD_AUDIO ack that resolves the webview's promise.
    # CANCEL_CARD_AUDIO marks "uid:field" keys (or the whole queue) so pending
    # items are skipped before their synthesis starts.
    GENERATE_CARD_AUDIO = 'GENERATE_CARD_AUDIO'
    CARD_AUDIO_RESULT = 'CARD_AUDIO_RESULT'
    DID_GENERATE_CARD_AUDIO = 'DID_GENERATE_CARD_AUDIO'
    CANCEL_CARD_AUDIO = 'CANCEL_CARD_AUDIO'
    DID_CANCEL_CARD_AUDIO = 'DID_CANCEL_CARD_AUDIO'

    SET_OPENAI_API_KEY = 'SET_OPENAI_API_KEY'
    DID_SET_OPENAI_API_KEY = 'DID_SET_OPENAI_API_KEY'

    EDIT_SETTING = 'EDIT_SETTING'
    DID_EDIT_SETTING = 'DID_EDIT_SETTING'

    SET_LLM_MODEL = 'SET_LLM_MODEL'
    DID_SET_LLM_MODEL = 'DID_SET_LLM_MODEL'

    SET_TEMPERATURE = 'SET_TEMPERATURE'
    DID_SET_TEMPERATURE = 'DID_SET_TEMPERATURE'

    DID_LOAD_SETTINGS = 'DID_LOAD_SETTINGS'
    DID_FINISH_STARTUP = 'DID_FINISH_STARTUP'

    SET_WEBAPP_LOADING = 'SET_WEBAPP_LOADING'
    SET_WEBAPP_LOADING_TEXT = 'SET_WEBAPP_LOADING_TEXT'

    NETWORK_REQUEST = 'NETWORK_REQUEST'
    DID_NETWORK_REQUEST = 'DID_NETWORK_REQUEST'

    PRINT_FROM_JS = 'PRINT_FROM_JS'
    PRINT_FROM_SUBMODULE = 'PRINT_FROM_SUBMODULE'

    SUBMODULE_ERROR = 'SUBMODULE_ERROR'

    STOP_LOADERS = 'STOP_LOADERS'

    ERROR = 'ERROR'
