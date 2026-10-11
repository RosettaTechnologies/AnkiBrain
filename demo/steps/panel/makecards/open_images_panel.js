/* Open the images library: in a panel this wide it is a drawer behind the
 * "Images (N)" handle on the right edge, so click the handle when it is
 * collapsed. Idempotent: the label says which way the click goes. */
const toggle = demo.q('.images-edge-toggle');
if (!toggle) throw new Error('no images panel handle');
if ((toggle.getAttribute('aria-label') || '').startsWith('Expand')) {
  toggle.click();
}
