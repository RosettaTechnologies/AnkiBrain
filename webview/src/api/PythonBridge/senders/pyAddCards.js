import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";
import { errorToast, successToast } from "../../toast";
import { setCards } from "../../redux/slices/cards";
import { pyEditSetting } from "./pyEditSetting";
import { store } from "../../redux";
import { countAnkiCards } from "../../occlusion";
import { pyBackupCards, pyClearCardsBackup } from "./pyCardBackup";

// Adds are chunked so a 1000+ card batch never becomes one multi-MB bridge
// payload or one long blocking loop on the python side, and so progress is
// observable. Each chunk still allocates media/notes as before.
export const ADD_CARDS_BATCH_SIZE = 50;

export async function pyAddCards(
  cards,
  deckName = "AnkiBrain",
  deleteCardsAfterAdding = true,
  onProgress = null
) {
  if (deckName === "") {
    deckName = "AnkiBrain";
  }

  try {
    // Durable snapshot BEFORE any note is inserted. Removed only after every
    // chunk succeeded, so a crash mid-add leaves the exact list recoverable.
    await pyBackupCards(cards, deckName);

    for (let i = 0; i < cards.length; i += ADD_CARDS_BATCH_SIZE) {
      const batch = cards.slice(i, i + ADD_CARDS_BATCH_SIZE);
      await asendPythonCommand(IC.ADD_CARDS, { cards: batch, deckName });
      if (onProgress) {
        onProgress(Math.min(i + batch.length, cards.length), cards.length);
      }
    }

    // Add completed cleanly: the snapshot is no longer needed.
    await pyClearCardsBackup();

    if (deleteCardsAfterAdding) {
      // If error is not caught, command was successful, so we can clear the cards in AnkiBrain.
      store.dispatch(setCards([]));
      await pyEditSetting("tempCards", []);
    }

    // Occlusion cards are one note producing N cards (one per ordinal);
    // everything else is one note per card. Say so when they differ.
    const { notes, cards: ankiCardCount } = countAnkiCards(cards);
    if (ankiCardCount === notes) {
      successToast(
        "Cards Added",
        `${notes} card${notes === 1 ? "" : "s"} ${
          notes === 1 ? "has" : "have"
        } been added to deck: ${deckName}`
      );
    } else {
      successToast(
        "Cards Added",
        `${notes} note${notes === 1 ? "" : "s"} (${ankiCardCount} card${
          ankiCardCount === 1 ? "" : "s"
        }) added to deck: ${deckName}`
      );
    }
  } catch (err) {
    // The backup is intentionally left in place for recovery. This is a
    // failure the user has to read and act on, so it opens the error dialog
    // rather than a toast that vanishes.
    errorToast(
      "Could Not Add Cards",
      "There was an error adding cards to Anki. " +
        "This happens if you do not have the English Basic and Cloze card types available, " +
        "or if you made too many modifications to the Basic or Cloze card templates. " +
        "If you are not using Anki in English, first temporarily switch your Anki to English. " +
        'Go to Tools -> Manage Note Types and search the list for "Basic" and "Cloze". ' +
        'If you do not see them, click "Add", then click "Add: Basic" -> OK, then again "Add: Cloze" -> OK. ' +
        'Click on the "fields" button and make sure that the card types have English fields. ' +
        "You can now switch Anki back to your native language. " +
        "If you still need help, please email ankibrain@rankmd.org"
    );
  }
}
