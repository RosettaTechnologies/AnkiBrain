/* Frame the generated card list: jump to its first page, then bring the
 * "Review & edit cards" heading to the top of the scrolling preview column.
 * The column keeps its scroll position across shots, so without this the
 * capture would show whatever the previous shot left in view. */
demo.clickText('First');

//---
const previewer = demo.q('.card-previewer');
if (previewer) previewer.scrollTop = 0;

//---
const heading = demo.qa('h1, h2, h3, h4, h5, h6, p, span, div').find(
  (n) => /^Review & edit cards \(\d+\)$/.test((n.textContent || '').trim()));
if (!heading) throw new Error('no "Review & edit cards" heading');
heading.scrollIntoView({ block: 'start' });
