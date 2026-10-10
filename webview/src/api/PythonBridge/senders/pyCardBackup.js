import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

// Durable snapshot of a card list before it is handed to Anki (see
// card_backup.py). Cleared after a clean add or an explicit clear.
export function pyBackupCards(cards, deckName) {
  return asendPythonCommand(IC.BACKUP_CARDS, { cards, deckName });
}

export function pyClearCardsBackup() {
  return asendPythonCommand(IC.CLEAR_CARDS_BACKUP, {});
}
