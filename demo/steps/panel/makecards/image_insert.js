/* Attach the opened figure to the first card that does not carry it yet, then
 * bring that row into view: the shot's proof is the disabled Inserted badge on
 * a card row. Attaching is idempotent, so a re-run of the shot never ends up
 * with a modal that has nothing to click. */
const modal = [...document.querySelectorAll('[role="dialog"]')].find(
  (d) => (d.textContent || '').includes('Use this image'));
if (!modal) throw new Error('the "Use this image" modal is not open');

const rows = [...modal.querySelectorAll('button')]
  .filter((b) => (b.textContent || '').trim() === 'Insert');
if (!rows.length) {
  throw new Error('no card in the "Use this image" modal can take this image');
}
rows[0].click();

//---
const attached = [...document.querySelectorAll('[role="dialog"]')]
  .filter((d) => (d.textContent || '').includes('Use this image'))
  .flatMap((d) => [...d.querySelectorAll('button')])
  .filter((b) => /inserted/i.test(b.textContent || ''));
if (!attached.length) throw new Error('the image was not attached to a card');
attached[0].scrollIntoView({ block: 'center' });
