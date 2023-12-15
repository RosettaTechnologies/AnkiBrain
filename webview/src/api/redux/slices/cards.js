import { createSlice } from "@reduxjs/toolkit";

export const cardsSlice = createSlice({
  name: "cards",
  initialState: { value: [] },
  reducers: {
    setCards: (state, action) => {
      for (let card of action.payload) {
        if (!card.tags) {
          card.tags = [];
        }
      }

      state.value = action.payload;
    },
    addCards: (state, action) => {
      for (let card of action.payload) {
        if (!card.tags) {
          card.tags = [];
        }
      }

      state.value.push(...action.payload);
    },
    addCard: (state, action) => {
      let card = action.payload;
      if (!card.tags) {
        card.tags = [];
      }

      state.value.push(action.payload);
    },
    resetCards: (state, action) => {
      state.value = [];
    },
    deleteCardAtIndex: (state, action) => {
      state.value.splice(action.payload, 1);
    },
  },
});

export const { setCards, addCards, addCard, resetCards, deleteCardAtIndex } =
  cardsSlice.actions;
