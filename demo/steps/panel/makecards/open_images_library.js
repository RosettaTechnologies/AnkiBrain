/* Open the first figure in the images library.
 *
 * The thumbnails are `<button><img/></button>`; the container differs by
 * layout (a side column on wide windows, a drawer here), and the staging
 * panel's per-page previews are not library entries - hence the filter. */
const toggle = demo.q('.images-edge-toggle');
if (toggle && (toggle.getAttribute('aria-label') || '').startsWith('Expand')) {
  throw new Error('the images library is still collapsed');
}

const thumbs = demo.qa('button').filter(
  (b) => b.querySelector('img') && !b.closest('.staged-document-panel'));
if (!thumbs.length) throw new Error('the images library has no thumbnails');
thumbs[0].click();
