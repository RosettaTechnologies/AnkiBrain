import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/*
 * Import arbitrary images for image-occlusion cards. Python opens the file
 * picker (or grabs the clipboard image) on the UI thread, copies the bytes
 * into media_tmp and answers with imagesRegistry descriptors
 * {id, url, mediaType} — full bytes never cross the JS<->Python bridge.
 */
export function pyImportImages(source = "files") {
  return asendPythonCommand(IC.IMPORT_IMAGES, { source });
}
