/* Close the images drawer: it dims the panel behind it and the shots that
 * follow are about other surfaces. Idempotent. */
const toggle = demo.q('.images-edge-toggle');
if (!toggle) throw new Error('no images panel handle');
if ((toggle.getAttribute('aria-label') || '').startsWith('Collapse')) {
  toggle.click();
}
