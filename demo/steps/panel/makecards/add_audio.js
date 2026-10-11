/* Generate audio for the first card's front field (real Kokoro synthesis: the
 * engine spawns on the first request, which is why this shot gets a long
 * timeout). The clip's Play/Remove controls appear when CARD_AUDIO_RESULT
 * lands. */
const previewer = demo.q('.card-previewer');
if (previewer) previewer.scrollTop = 0;
demo.scrollToText('Add audio');
demo.clickText('Add audio');
