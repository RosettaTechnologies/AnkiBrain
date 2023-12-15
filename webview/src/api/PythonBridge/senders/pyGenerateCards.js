import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

export function pyGenerateCards(text, customPrompt, cardType, language) {
  return asendPythonCommand(IC.GENERATE_CARDS, {
    text,
    customPrompt,
    type: cardType,
    language,
  });
}
