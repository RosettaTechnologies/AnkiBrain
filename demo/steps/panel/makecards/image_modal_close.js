/* Close the "Use this image" modal.
 *
 * role="dialog" also matches the images drawer and the toolbar popovers, so the
 * button is looked up inside the modal that owns the header. */
const modal = [...document.querySelectorAll('[role="dialog"]')].find(
  (d) => (d.textContent || '').includes('Use this image'));
if (!modal) throw new Error('the "Use this image" modal is not open');
const close = modal.querySelector('button[aria-label="Close"]');
if (!close) throw new Error('no close button in the "Use this image" modal');
close.click();
