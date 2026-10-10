import { store } from "..";
import { setCards } from "./cards";
import { countAnkiCards, occlusionCardCount } from "../../occlusion";

test("occlusionCardCount counts distinct ordinals (grouped masks = one card)", () => {
  expect(occlusionCardCount({ occlusions: [] })).toBe(0);
  expect(
    occlusionCardCount({
      occlusions: [
        { ordinal: 1, shape: "rect" },
        { ordinal: 2, shape: "rect" },
        { ordinal: 2, shape: "ellipse" }, // grouped -> same card
      ],
    })
  ).toBe(2);
  // Garbage ordinals fall back to card 1 rather than producing NaN.
  expect(occlusionCardCount({ occlusions: [{ ordinal: "x" }] })).toBe(1);
});

test("countAnkiCards distinguishes notes from Anki cards", () => {
  const cards = [
    { type: "basic" },
    { type: "cloze" },
    {
      type: "occlusion",
      occlusions: [{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 2 }],
    },
  ];
  expect(countAnkiCards(cards)).toEqual({ notes: 3, cards: 4 });
  expect(countAnkiCards([])).toEqual({ notes: 0, cards: 0 });
});

test("restored occlusion cards keep their image id and masks through setCards", () => {
  // Mirrors the boot path: tempCards come back from settings and must survive
  // into the store so RESOLVE_IMAGES can hydrate the image preview.
  store.dispatch(
    setCards([
      {
        type: "occlusion",
        image: "abc12345/ankibrain-deadbeef.png",
        occlusions: [
          {
            ordinal: 1,
            shape: "rect",
            left: 0.1,
            top: 0.2,
            width: 0.3,
            height: 0.1,
          },
        ],
        occludeInactive: false,
        header: "Label the heart",
        backExtra: "",
      },
    ])
  );

  const card = store.getState().cards.value[0];
  expect(card.image).toBe("abc12345/ankibrain-deadbeef.png");
  expect(card.occlusions).toHaveLength(1);
  expect(card.uid).toBeTruthy();
  expect(card.tags).toEqual([]);
});
