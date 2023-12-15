import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

export async function pyOpenDocumentBrowser() {
  let res = await asendPythonCommand(IC.OPEN_DOCUMENT_BROWSER);
  let selectedDocuments = res.documents;
  if (!selectedDocuments) {
    return Promise.resolve([]);
  }

  for (let doc of selectedDocuments) {
    // If any selected is > 1GB in size, throw an error.
    if (doc.size && doc.size > 1024 * 1024 * 1024) {
      throw new Error(
        "At least one of your selected documents was larger than 1 GB. " +
          "Anything larger than this is impossible to handle."
      );
    }
  }

  return res;
}
