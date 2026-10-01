import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";
import { infoToast, successToast } from "../../toast";
import { setCards } from "../../redux/slices/cards";
import { pyEditSetting } from "./pyEditSetting";
import { store } from "../../redux";

export async function pyAddCards(
  cards,
  deckName = "AnkiBrain",
  deleteCardsAfterAdding = true
) {
  if (deckName === "") {
    deckName = "AnkiBrain";
  }

  try {
    const res = await asendPythonCommand(IC.ADD_CARDS, { cards, deckName });

    if (res && res.tts_note) {
      // Card audio embedding was requested but skipped — never blocks the
      // add itself (python degrades to cards-without-audio by design).
      const msg =
        res.tts_note === "absent"
          ? "Cards were added without voice audio: the Kokoro voice engine is not installed yet. Set it up in Settings → Voice."
          : res.tts_note === "unsupported"
            ? "Cards were added without voice audio: the local voice engine does not support this platform."
            : "Cards were added, but some voice audio could not be synthesized. Check Settings → Voice.";
      infoToast("Card Audio Skipped", msg, 15000);
    }

    if (deleteCardsAfterAdding) {
      // If error is not caught, command was successful, so we can clear the cards in AnkiBrain.
      store.dispatch(setCards([]));
      await pyEditSetting("tempCards", []);
    }

    successToast(
      "Cards Added",
      `${cards.length} cards have been added to deck: ${deckName}`
    );
  } catch (err) {
    infoToast(
      "Could Not Add Cards",
      "There was an error adding cards to Anki. " +
        "This happens if you do not have the English Basic and Cloze card types available, " +
        "or if you made too many modifications to the Basic or Cloze card templates. " +
        "If you are not using Anki in English, first temporarily switch your Anki to English. " +
        'Go to Tools -> Manage Note Types and search the list for "Basic" and "Cloze". ' +
        'If you do not see them, click "Add", then click "Add: Basic" -> OK, then again "Add: Cloze" -> OK. ' +
        'Click on the "fields" button and make sure that the card types have English fields. ' +
        "You can now switch Anki back to your native language. " +
        "If you still need help, please email ankibrain@rankmd.org",
      120 * 1000
    );
  }
}
