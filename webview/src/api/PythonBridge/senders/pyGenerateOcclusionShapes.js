import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";
import { isLocalMode } from "../../user";
import { store } from "../../redux";
import { getAPIEndpoints } from "../../server-api/networking";

/*
 * Ask the AI for occlusion regions on one image.
 *
 * Local mode routes to the ChatAI subprocess, which owns the vision call;
 * server mode posts the image to the AnkiBrain server's /occlusion endpoint
 * (url + accessToken supplied here, like UPLOAD_DOCUMENT). In both cases the
 * addon process reads the image from media_tmp, so the bytes never cross the
 * JS<->Python bridge.
 *
 * Resolves to {shapes, header, backExtra, user?} (user is present in server
 * mode so the caller can refresh the balance).
 */
export function pyGenerateOcclusionShapes({
  imageId,
  context = "",
  language = "English",
}) {
  const params = {
    imageId,
    context,
    language,
    model: store.getState().appSettings.ai.llmModel,
  };

  if (!isLocalMode()) {
    const user = store.getState().user.value;
    if (!user || !user.accessToken) {
      return Promise.reject(
        new Error("Log in to use AI occlusion suggestions.")
      );
    }
    params.url = getAPIEndpoints().OCCLUSION;
    params.accessToken = user.accessToken;
  }

  return asendPythonCommand(IC.GENERATE_OCCLUSION_SHAPES, params);
}
