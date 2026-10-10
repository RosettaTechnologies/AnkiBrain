import { store } from "..";
import {
  setCards,
  applyCardAudio,
  clearCardAudio,
  pruneCardAudio,
} from "./cards";
import { addAudioEntries } from "./audioRegistry";
import {
  audioJobStarted,
  audioJobSettled,
  audioJobFailed,
  audioJobsCancelled,
  consumeCancelled,
  audioJobsCleared,
  countGenerating,
} from "./cardAudio";
import {
  fieldsWantingAudio,
  textForAudioField,
} from "../../cardAudioFields";

const TTS_CARD = {
  type: "basic",
  front: "Mitochondria are the ___ of cells",
  back: "powerhouses",
  tags: [],
};

test("cards entering the store get a stable uid and an audio map", () => {
  store.dispatch(setCards([{ ...TTS_CARD }, { type: "cloze", text: "Paris is {{c1::France}}", tags: [] }]));
  const cards = store.getState().cards.value;

  expect(cards[0].uid).toBeTruthy();
  expect(cards[1].uid).toBeTruthy();
  expect(cards[0].uid).not.toBe(cards[1].uid);
  expect(cards[0].audio).toEqual({});

  // Restoring the same shape back (tempCards round trip) keeps existing uids.
  const uid = cards[0].uid;
  store.dispatch(setCards(JSON.parse(JSON.stringify(cards))));
  expect(store.getState().cards.value[0].uid).toBe(uid);
});

test("audio results land by uid, surviving index shifts", () => {
  store.dispatch(setCards([{ ...TTS_CARD }, { ...TTS_CARD, back: "two" }]));
  let cards = store.getState().cards.value;
  const [uidA, uidB] = cards.map((c) => c.uid);

  store.dispatch(applyCardAudio({ uid: uidB, field: "back", id: "tts/b.wav" }));
  // The first card is deleted before A's result arrives.
  store.dispatch(setCards(store.getState().cards.value.filter((c) => c.uid !== uidA)));
  store.dispatch(applyCardAudio({ uid: uidA, field: "front", id: "tts/a.wav" }));

  cards = store.getState().cards.value;
  expect(cards.length).toBe(1);
  expect(cards[0].uid).toBe(uidB);
  expect(cards[0].audio).toEqual({ back: "tts/b.wav" }); // A's result dropped

  store.dispatch(clearCardAudio({ uid: uidB, field: "back" }));
  expect(store.getState().cards.value[0].audio).toEqual({});
});

test("pruneCardAudio drops fields whose media_tmp files were purged", () => {
  store.dispatch(setCards([{ ...TTS_CARD }]));
  const uid = store.getState().cards.value[0].uid;
  store.dispatch(applyCardAudio({ uid, field: "front", id: "tts/gone.wav" }));
  store.dispatch(applyCardAudio({ uid, field: "back", id: "tts/keep.wav" }));

  store.dispatch(pruneCardAudio(["tts/gone.wav"]));
  expect(store.getState().cards.value[0].audio).toEqual({ back: "tts/keep.wav" });
});

test("audioRegistry keys clips by id, mirroring images", () => {
  store.dispatch(
    addAudioEntries([{ id: "tts/k.wav", url: "file:///media_tmp/tts/k.wav", mediaType: "audio/wav" }])
  );
  expect(store.getState().audioRegistry.value["tts/k.wav"].url).toContain("tts/k.wav");

  store.dispatch(addAudioEntries([{ id: "tts/k.wav", url: "file:///again.wav" }]));
  expect(Object.keys(store.getState().audioRegistry.value).length).toBe(1);
  expect(store.getState().audioRegistry.value["tts/k.wav"].url).toBe("file:///again.wav");
});

test("mode policy: front/back/both skip existing audio and empty fields; cloze only takes the answer-side clip", () => {
  const basic = { type: "basic", front: "Q", back: "A", tags: [], audio: {} };

  expect(fieldsWantingAudio(basic, "none")).toEqual([]);
  expect(fieldsWantingAudio(basic, "front")).toEqual(["front"]);
  expect(fieldsWantingAudio(basic, "back")).toEqual(["back"]);
  expect(fieldsWantingAudio(basic, "both")).toEqual(["front", "back"]);

  // Already-generated fields are never re-targeted by the batch scan.
  expect(fieldsWantingAudio({ ...basic, audio: { front: "tts/f.wav" } }, "both")).toEqual(["back"]);

  // Empty/whitespace fields have nothing to speak.
  expect(fieldsWantingAudio({ ...basic, back: "  " }, "back")).toEqual([]);

  // Cloze: 'front' skips entirely (a resolved clip would spoil the blank);
  // 'back'/'both' take its single answer-side slot.
  const cloze = { type: "cloze", text: "Paris is {{c1::France}}", tags: [], audio: {} };
  expect(fieldsWantingAudio(cloze, "front")).toEqual([]);
  expect(fieldsWantingAudio(cloze, "back")).toEqual(["back"]);
  expect(fieldsWantingAudio(cloze, "both")).toEqual(["back"]);
  expect(fieldsWantingAudio({ ...cloze, audio: { back: "tts/c.wav" } }, "both")).toEqual([]);

  // The text a cloze job reads is the raw card text (python resolves it).
  expect(textForAudioField(cloze, "back")).toBe("Paris is {{c1::France}}");
});

test("generating marks gate, settle, and cancel", () => {
  const items = [
    { uid: "u1", field: "front", text: "Q1", isCloze: false },
    { uid: "u1", field: "back", text: "A1", isCloze: false },
    { uid: "u2", field: "back", text: "A2", isCloze: true },
  ];
  store.dispatch(audioJobStarted(items));
  expect(countGenerating(store.getState().cardAudio.generating)).toBe(3);

  store.dispatch(audioJobSettled({ uid: "u1", field: "front" }));
  expect(countGenerating(store.getState().cardAudio.generating)).toBe(2);

  // Failed results need the matching settle too (that's what the result
  // handler dispatches): errors are a separate map from spinners.
  store.dispatch(audioJobSettled({ uid: "u1", field: "back" }));
  store.dispatch(audioJobFailed({ uid: "u1", field: "back", message: "boom" }));
  expect(store.getState().cardAudio.errors.u1.back).toBe("boom");
  expect(countGenerating(store.getState().cardAudio.generating)).toBe(1); // only u2.back

  // Field-level cancel marks the key and drops only ITS spinner — other
  // jobs in the batch keep going and their results still apply.
  store.dispatch(audioJobsCancelled({ keys: ["u2:back"] }));
  expect(store.getState().cardAudio.cancelled).toEqual({ u2: { back: true } });
  expect(countGenerating(store.getState().cardAudio.generating)).toBe(0);
  store.dispatch(consumeCancelled({ uid: "u2", field: "back" }));
  expect(store.getState().cardAudio.cancelled).toEqual({});

  // all=true cancel empties everything (spinners included).
  store.dispatch(audioJobStarted(items));
  store.dispatch(audioJobsCancelled({ all: true }));
  expect(countGenerating(store.getState().cardAudio.generating)).toBe(0);

  // Bridge-error recovery path: spinners up, then cleared wholesale.
  store.dispatch(audioJobStarted([items[0]]));
  store.dispatch(audioJobsCleared());
  expect(countGenerating(store.getState().cardAudio.generating)).toBe(0);
});

test("re-enrolling a field clears its stale cancel/error marks", () => {
  store.dispatch(audioJobsCancelled({ keys: ["u3:front"] }));
  store.dispatch(audioJobFailed({ uid: "u3", field: "front", message: "old" }));

  store.dispatch(audioJobStarted([{ uid: "u3", field: "front", text: "x", isCloze: false }]));

  const state = store.getState().cardAudio;
  expect(state.generating.u3.front).toBe(true);
  expect(state.cancelled.u3).toBeUndefined();
  expect(state.errors.u3).toBeUndefined();
});
