/*
 * Which audio fields a card wants, given the review-screen TTS mode. Pure
 * (no store imports) so the policy is unit-testable:
 *
 *   none   → nothing is ever eligible
 *   front  → basic cards' question side; cloze cards are skipped entirely
 *            (their single clip speaks the RESOLVED sentence, which would
 *            spoil the blank if it lived on the question side — so a
 *            cloze card's only audio slot is 'back' / the Extra field)
 *   back   → basic answer side; cloze → its one answer-side clip
 *   both   → front + back
 *
 * A field that already holds an audio id is never returned: regeneration is
 * explicit (per-field button), and editing a field clears its stale clip, so
 * "Generate audio" only ever fills gaps.
 */
export function fieldsWantingAudio(card, mode) {
  if (!card || mode === "none" || mode === undefined) {
    return [];
  }

  const audio = card.audio || {};
  const wanted = [];

  if (card.type === "cloze") {
    if (mode !== "front" && audio.back === undefined && isSpeakable(card.text)) {
      wanted.push("back");
    }
    return wanted;
  }

  if ((mode === "front" || mode === "both") && audio.front === undefined && isSpeakable(card.front)) {
    wanted.push("front");
  }
  if ((mode === "back" || mode === "both") && audio.back === undefined && isSpeakable(card.back)) {
    wanted.push("back");
  }
  return wanted;
}

export function isSpeakable(text) {
  return typeof text === "string" && text.trim() !== "";
}

// The card text a synthesis job should read for a given field.
export function textForAudioField(card, field) {
  if (card.type === "cloze") {
    // Cloze audio is always the resolved sentence (python strips {{c1::...}}).
    return card.text || "";
  }
  return card[field] || "";
}

// "uid:field" is the cancel-address for a single job.
export function audioJobKey(uid, field) {
  return `${uid}:${field}`;
}
