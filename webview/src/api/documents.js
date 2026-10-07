import { store, updateUser } from "./redux";
import {
  addDocuments as addDocumentsToStore,
  deleteAllDocuments as del,
  setDocuments,
} from "./redux/slices/documentsSlice";
import { pyDeleteAllDocuments } from "./PythonBridge/senders/pyDeleteAllDocuments";
import { pyOpenDocumentBrowser } from "./PythonBridge/senders/pyOpenDocumentBrowser";
import { setDocumentsLoading } from "./redux/slices/documentsLoadingSlice";
import { setUseDocuments as set } from "./redux/slices/useDocuments";
import { setAppAlertModal } from "./redux/slices/appAlertModal";
import { clearMessages } from "./chat";
import { errorToast, infoToast, successToast } from "./toast";
import { isLocalMode } from "./user";
import {
  deleteDocumentEndpoint,
  uploadDocument,
} from "./server-api/networking/documents";
import { getAPIEndpoints } from "./server-api/networking";
import { asendPythonCommand } from "./PythonBridge";
import { InterprocessCommand } from "./PythonBridge/InterprocessCommand";
import { pyEditSetting } from "./PythonBridge/senders/pyEditSetting";

// Extensions the Make Cards picker treats as standalone images (they become
// image-occlusion cards, never text documents).
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
]);

export function isImageFileDescriptor(file) {
  return IMAGE_EXTENSIONS.has(((file && file.extension) || "").toLowerCase());
}

/*
 * Make Cards file picker: one dialog for documents AND images. Returns
 * {documents, images} (raw file descriptors from the native picker) or null
 * when the user cancelled. Nothing is processed yet — the caller shows the
 * document warning first, then calls splitSelectedDocument / importImagePaths.
 */
export async function pickCardsSource() {
  const res = await pyOpenDocumentBrowser({ allowImages: true });
  const files = (res && res.documents) || [];
  if (files.length === 0) {
    return null;
  }
  return {
    documents: files.filter((file) => !isImageFileDescriptor(file)),
    images: files.filter((file) => isImageFileDescriptor(file)),
  };
}

/*
 * Split one already-picked document into chunks (and extract its images in
 * the card-generation split). Local mode runs the ChatAI subprocess; server
 * mode uploads to the split endpoint. Returns {chunks, chunkPages, images,
 * doc} or null (toast already shown). chunkPages is one 1-based page number
 * (or null) per chunk, or null for the whole document when the format/source
 * carries no page numbers.
 */
export async function splitSelectedDocument(
  document,
  dispatch = store.dispatch
) {
  let doc = document;

  if (isLocalMode()) {
    try {
      if (doc.size > 1024 * 1024 * 1024) {
        infoToast("Document Too Large", "The maximum file size is 1 GB.");
        return null;
      }

      infoToast(
        "Processing Document...",
        "Document processing has begun. This can take a while on files with a lot of text."
      );

      let res = await asendPythonCommand(InterprocessCommand.SPLIT_DOCUMENT, {
        path: doc.path,
      });

      // Local mode: python wrote extracted images into media_tmp itself and
      // returns chunk/image JSON strings over the bridge.
      let chunks = res.chunks;
      if (typeof chunks === "string") {
        chunks = JSON.parse(chunks);
      }

      let chunkPages = res.chunk_pages ?? null;
      if (typeof chunkPages === "string") {
        chunkPages = JSON.parse(chunkPages);
      }

      let images = res.images || [];
      if (typeof images === "string") {
        images = JSON.parse(images);
      }

      return { chunks, chunkPages, images, doc };
    } catch (err) {
      errorToast("Error", err.message);
    }

    return null;
  }

  if (!store.getState().user.value) {
    infoToast("Log in required", "Please log in first.");
    return null;
  }

  if (doc.size > 1024 * 1024 * 100) {
    infoToast(
      "Document Too Large",
      "The maximum file size for AnkiBrain Server Mode is 100 MB."
    );

    return null;
  }

  try {
    let res = await uploadDocument(
      doc.path,
      getAPIEndpoints().DOCUMENT_SPLIT,
      store.getState().user.value.accessToken
    );

    if (res.status === "fail") {
      infoToast("Request failed", res.message);
      return null;
    } else if (res.status === "error") {
      errorToast("Request error", res.message);
      return null;
    }

    let user = res.data.user;
    dispatch(updateUser(user));

    let chunks = res.data.chunks;
    if (typeof chunks === "string") {
      chunks = JSON.parse(chunks);
    }

    // Server chunks are LangChain JS Document objects: metadata.loc.pageNumber
    // is the 1-based page (metadata.pageNumber on older versions). Plain
    // strings or page-less formats leave chunkPages null -> "Section N" rows.
    let chunkPages = null;
    if (chunks.length > 0 && typeof chunks[0] === "object") {
      chunkPages = chunks.map(
        (chunk) =>
          chunk.metadata?.loc?.pageNumber ??
          chunk.metadata?.pageNumber ??
          null
      );
      chunks = chunks.map((chunk) => chunk.pageContent);
    }

    // Server mode: the python layer already wrote image bytes to
    // media_tmp; what remains here are {id, url, mediaType, anchorChunk}.
    let images = res.data.images || [];

    return { chunks, chunkPages, images, doc };
  } catch (err) {
    errorToast("Error attempting request", err);
    return null;
  }
}

export async function importDocuments(dispatch = store.dispatch) {
  if (import.meta.env.VITE_APP_ENV === "STANDALONE") {
    return;
  }

  dispatch(setDocumentsLoading(true));

  try {
    if (!isLocalMode() && !store.getState().user.value) {
      infoToast("Log in required", "Please log in first.");
      return;
    }

    let res = await pyOpenDocumentBrowser();
    if (!res.documents) {
      return;
    }

    let docs = res.documents;
    if (docs.length < 1) {
      return;
    }

    if (!isLocalMode() && docs.length > 1) {
      infoToast(
        "Multiple documents",
        "You have selected multiple documents; only the first will be imported. " +
          "Multi-document upload will be added in the future!" // todo fix
      );
    }

    let doc = docs[0];

    if (isLocalMode()) {
      if (doc.size > 1024 * 1024 * 1024) {
        infoToast("Document Too Large", "The maximum file size is 1 GB.");
        return;
      }

      infoToast(
        "Adding Documents...",
        "This can take a while depending on your documents' word count and your CPU/GPU hardware. " +
          "For example, on limited hardware, the 2019 MGH WhiteBook takes about 10 minutes to import."
      );

      let added = await asendPythonCommand(InterprocessCommand.ADD_DOCUMENTS, {
        documents: docs,
      });

      let documentsAdded = added.documents_added;
      dispatch(addDocumentsToStore(documentsAdded));
      successToast(
        "Documents Added",
        `${documentsAdded.length} document(s) have been added to your local vector storage.`
      );

      return;
    }

    if (doc.size > 1024 * 1024 * 100) {
      infoToast(
        "Document Too Large",
        "The maximum file size for AnkiBrain Server Mode is 100 MB."
      );

      return;
    }

    // Unlike _fetch, there is no underlying error handling for this method, so we need to handle it here.
    res = await uploadDocument(
      doc.path,
      getAPIEndpoints().DOCUMENT,
      store.getState().user.value.accessToken
    );

    if (res.status === "success") {
      successToast(
        "Document Uploaded",
        `Your document ${doc.file_name_with_extension} was successfully uploaded.`
      );

      let user = res.data.user;
      dispatch(updateUser(user));
      dispatch(setDocuments(user.documentsStored));
    } else if (res.status === "fail") {
      infoToast("Request failed", res.message);
    } else if (res.status === "error") {
      errorToast("Request error", res.message);
    }
  } catch (err) {
    errorToast("Error", String((err && err.message) || err));
  } finally {
    dispatch(setDocumentsLoading(false));
  }
}

export async function deleteAllDocuments(dispatch = store.dispatch) {
  if (isLocalMode()) {
    pyDeleteAllDocuments();
    dispatch(del());
    await pyEditSetting("documents_saved", []);
  } else {
    let res = await deleteDocumentEndpoint(
      store.getState().user.value.accessToken
    );

    if (res.status === "success") {
      successToast("Documents Deleted", res.message);
      const user = res.data.user;
      dispatch(updateUser(user));
      dispatch(setDocuments(user.documentsStored));
      dispatch(del());
    }
  }
}

export async function setUseDocuments(
  useDocuments = false,
  dispatch = store.dispatch
) {
  if (store.getState().messages.length > 0) {
    await clearMessages();
    infoToast(
      "Clearing Conversation",
      "FYI: This action clears your current conversation."
    );
  }

  if (!useDocuments) {
    dispatch(set(useDocuments));
    return;
  }

  let documents = [];
  if (isLocalMode()) {
    documents = store.getState().documents.value;
  } else {
    documents = store.getState().user.value.documentsStored;
  }

  if (documents.length > 0) {
    dispatch(set(useDocuments));
    return;
  }

  if (documents.length === 0) {
    // Show app alert modal, refuse to toggle useDocuments.
    dispatch(
      setAppAlertModal({
        header: "No documents",
        alertText:
          "You have to import at least one document before using this option.",
        show: true,
      })
    );
  }
}
