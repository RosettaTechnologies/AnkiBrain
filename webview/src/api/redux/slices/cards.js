import { createSlice } from "@reduxjs/toolkit";

let uidCounter = 0;
const newCardUid = () =>
  `c${Date.now().toString(36)}-${(++uidCounter).toString(36)}`;

/*
 * Every pending card carries:
 *   uid   — stable client id, assigned the moment the card enters the store
 *           (AI batch, tempCards restore, or manual add). Async card-audio
 *           results address cards by uid, so deletes/reorders while a
 *           synthesis is in flight can never misland audio on the wrong card.
 *   audio — { front|back: media_tmp tts id }, mirroring how 'images' holds
 *           media_tmp ids. Cloze cards only ever use 'back' (their single
 *           resolved-sentence clip rides on the answer side).
 */
function normalizeCard(card) {
  if (!card.tags) {
    card.tags = [];
  }
  if (!card.uid) {
    card.uid = newCardUid();
  }
  if (typeof card.audio !== "object" || card.audio === null) {
    card.audio = {};
  }
  return card;
}

export const cardsSlice = createSlice({
  name: "cards",
  initialState: { value: [] },
  reducers: {
    setCards: (state, action) => {
      for (let card of action.payload) {
        normalizeCard(card);
      }

      state.value = action.payload;
    },
    addCards: (state, action) => {
      for (let card of action.payload) {
        normalizeCard(card);
      }

      state.value.push(...action.payload);
    },
    addCard: (state, action) => {
      normalizeCard(action.payload);

      state.value.push(action.payload);
    },
    resetCards: (state, action) => {
      state.value = [];
    },
    deleteCardAtIndex: (state, action) => {
      state.value.splice(action.payload, 1);
    },
    applyCardAudio: (state, action) => {
      const { uid, field, id } = action.payload;
      const card = state.value.find((c) => c.uid === uid);
      if (card) {
        card.audio = { ...(card.audio || {}), [field]: id };
      }
    },
    clearCardAudio: (state, action) => {
      const { uid, field } = action.payload;
      const card = state.value.find((c) => c.uid === uid);
      if (card && card.audio && card.audio[field] !== undefined) {
        const audio = { ...card.audio };
        delete audio[field];
        card.audio = audio;
      }
    },
    pruneCardAudio: (state, action) => {
      // Drop references to tts ids whose files were purged from media_tmp:
      // those fields read as "no audio" again and can simply be regenerated.
      const gone = new Set(action.payload);
      for (const card of state.value) {
        if (!card.audio) {
          continue;
        }
        for (const field of Object.keys(card.audio)) {
          if (gone.has(card.audio[field])) {
            delete card.audio[field];
          }
        }
      }
    },
  },
});

export const {
  setCards,
  addCards,
  addCard,
  resetCards,
  deleteCardAtIndex,
  applyCardAudio,
  clearCardAudio,
  pruneCardAudio,
} = cardsSlice.actions;
