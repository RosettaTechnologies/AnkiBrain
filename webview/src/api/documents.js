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

export async function splitDocument(dispatch = store.dispatch) {
  if (isLocalMode()) {
    try {
      let res = await pyOpenDocumentBrowser();
      let documents = res.documents;
      if (!documents) {
        return;
      }

      if (documents.length > 1) {
        infoToast(
          "Multiple Documents",
          "You have selected multiple documents. Only the first one will be used. This will be changed in a future update!"
        );
      }

      let document = documents[0];
      let path = document.path;

      if (document.size > 1024 * 1024 * 1024) {
        infoToast("Document Too Large", "The maximum file size is 1 GB.");
        return;
      }

      infoToast(
        "Processing Document...",
        "Document processing has begun. This can take a while on files with a lot of text."
      );

      res = await asendPythonCommand(InterprocessCommand.SPLIT_DOCUMENT, {
        path,
      });

      return res.chunks;
    } catch (err) {
      errorToast("Error", err.message);
    }

    return;
  }

  if (!store.getState().user.value) {
    infoToast("Log in required", "Please log in first.");
    return;
  }

  let res = await pyOpenDocumentBrowser();
  let docs = res.documents;
  if (!docs) {
    return;
  }

  if (docs.length < 1) {
    return;
  }

  if (docs.length > 1) {
    infoToast(
      "Multiple documents",
      "You have selected multiple documents; only the first will be imported." // todo fix
    );
  }

  let doc = docs[0];
  if (doc.size > 1024 * 1024 * 100) {
    infoToast(
      "Document Too Large",
      "The maximum file size for AnkiBrain Server Mode is 100 MB."
    );

    return;
  }

  try {
    res = await uploadDocument(
      doc.path,
      getAPIEndpoints().DOCUMENT_SPLIT,
      store.getState().user.value.accessToken
    );

    if (res.status === "fail") {
      infoToast("Request failed", res.message);
      return Promise.reject(new Error(res.message));
    } else if (res.status === "error") {
      errorToast("Request error", res.message);
      return Promise.reject(new Error(res.message));
    }

    let user = res.data.user;
    dispatch(updateUser(user));

    let chunks = res.data.chunks;
    if (typeof chunks === "string") {
      chunks = JSON.parse(chunks);
    }

    chunks = chunks.map((chunk) => chunk.pageContent);
    return chunks;
  } catch (err) {
    errorToast("Error attempting request", err);
  }
}

export async function importDocuments(dispatch = store.dispatch) {
  if (process.env.REACT_APP_ENV === "STANDALONE") {
    return;
  }

  dispatch(setDocumentsLoading(true));

  if (!isLocalMode() && !store.getState().user.value) {
    infoToast("Log in required", "Please log in first.");
    return;
  }

  let res = await pyOpenDocumentBrowser();
  if (!res.documents) {
    dispatch(setDocumentsLoading(false));
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

  try {
    if (isLocalMode()) {
      try {
        if (doc.size > 1024 * 1024 * 1024) {
          infoToast("Document Too Large", "The maximum file size is 1 GB.");
          return;
        }

        infoToast(
          "Adding Documents...",
          "This can take a while depending on your documents' word count and your CPU/GPU hardware. " +
            "For example, on limited hardware, the 2019 MGH WhiteBook takes about 10 minutes to import."
        );

        let res = await asendPythonCommand(InterprocessCommand.ADD_DOCUMENTS, {
          documents: docs,
        });

        let documentsAdded = res.documents_added;
        dispatch(addDocumentsToStore(documentsAdded));
        successToast(
          "Documents Added",
          `${documentsAdded.length} document(s) have been added to your local vector storage.`
        );
      } catch (err) {
        errorToast("Error", err);
      } finally {
        dispatch(setDocumentsLoading(false));
      }

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
    errorToast("Error attempting request", err);
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
