import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/*
 * Import arbitrary images for image-occlusion cards. Python copies the bytes
 * into media_tmp and answers with imagesRegistry descriptors
 * {id, url, mediaType} — full bytes never cross the JS<->Python bridge.
 *
 * source:
 *   'files'     — Python opens the image file picker on the UI thread
 *   'clipboard' — Python grabs the clipboard image
 *   'paths'     — import the explicit absolute paths already picked by the
 *                 caller (the Make Cards document/image browser)
 */
export function pyImportImages(source = "files", paths = []) {
  return asendPythonCommand(IC.IMPORT_IMAGES, { source, paths });
}
