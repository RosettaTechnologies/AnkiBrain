import { pyGenerateCards } from "./PythonBridge/senders/pyGenerateCards";
import { store, updateUser } from "./redux";
import { addCard, addCards, setCards } from "./redux/slices/cards";
import { isLocalMode } from "./user";
import { setMakeCardsLoading } from "./redux/slices/makeCardsText";
import { generateCardsRequest } from "./server-api/cards";
import { errorToast, infoToast, successToast } from "./toast";
import nlp from "compromise";
import { addFailedCards } from "./redux/slices/failedCards";
import { pyEditSetting } from "./PythonBridge/senders/pyEditSetting";
import { postChat } from "./server-api/networking/chat";

function splitIntoSentences(text) {
  let doc = nlp(text);
  return doc.sentences().out("array");
}

function convertAsterisksToCloze(text) {
  let counter = 1;
  let newStr = text.replace(/\*([^*]+)\*/g, function (match, group1) {
    return `{{c${counter++}::${group1}}}`;
  });

  return newStr;
}

async function handleCardsRawString(
  rawString,
  cardType,
  dispatch = store.dispatch
) {
  // Try converting to json
  try {
    let cards = JSON.parse(rawString);
    for (let card of cards) {
      if (!card.type) {
        card.type = cardType;
      }
      if (!card.tags) {
        card.tags = [];
      }

      /*
       * If cloze, we are expecting the text field to have **double asterisks** surrounding
       * important text that gpt wants to be a cloze deletion.
       */
      if (cardType === "cloze") {
        card.text = convertAsterisksToCloze(card.text);
      }
    }

    dispatch(addCards(cards));

    // TODO: needs to be removed, this only adds the currently made cards to temp cards rather than the entire deck in
    //  the redux store.
    await pyEditSetting("tempCards", cards);
    successToast(
      "Made Flashcards",
      `Successfully made ${cards.length} cards.`,
      3000
    );
  } catch (err) {
    dispatch(addFailedCards([rawString]));
    infoToast(
      "Some cards failed",
      "Some of your cards were generated improperly. " +
        "They may require a slight modification to work. " +
        'The malformed JSON strings have been placed in the "Failed Cards" tab.'
    );
  }
}

function parseJsonArrayFromString(str) {
  // This regular expression matches a JSON array
  // It looks for anything starting with '[' and ending with ']'
  // and captures any content in between, including nested arrays.
  const regex = /\[.*?]/s;

  const match = str.match(regex);
  if (match) {
    try {
      // Parse the found JSON array
      return JSON.parse(match[0]);
    } catch (e) {
      // Match is malformed.
      return null;
    }
  } else {
    // No array found.
    return null;
  }
}

function surroundKeywordsWithAsterisks(text, keywords) {
  let modifiedString = text;

  // Function to escape special characters for regex
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  keywords.forEach((word) => {
    let regex = new RegExp(escapeRegExp(word), "gi");
    modifiedString = modifiedString.replace(regex, "*$&*");
  });

  return modifiedString;
}

// TODO in progress
function buildClozeCardQuery(
  text,
  nClozes,
  customPrompt,
  language = "English"
) {
  return `
    Please pick ONLY ${nClozes} of the most important words or phrases in the following ${language} sentence.
    These words or phrases should be the most salient items of the sentence that provide key context. 
            
    "${text}"
    
    Please respond using valid JSON array syntax in ${language}.
    
    ${customPrompt ? "Additionally: " + customPrompt : ""}
    `;
}

// TODO in progress
// Expects text to be a single sentence.
export async function generateClozeCardFromSentence(
  text,
  nClozes,
  customPrompt = "",
  language = store.getState().language.value,
  dispatch = store.dispatch
) {
  if (isLocalMode()) {
    // TODO
  } else {
    let query = buildClozeCardQuery(text, nClozes, customPrompt, language);
    let res = await postChat(
      query,
      [],
      false,
      store.getState().appSettings.ai.llmModel,
      store.getState().appSettings.ai.temperature,
      store.getState().user.value.accessToken
    );

    if (res.status === "success") {
      dispatch(updateUser(res.data.user));
      let rawString = res.data.response.content;

      // GPT will hopefully return an array of keywords/keyphrases that we can create clozes from.
      let keywords = parseJsonArrayFromString(rawString);
      let finalClozeText = surroundKeywordsWithAsterisks(text, keywords);
      finalClozeText = convertAsterisksToCloze(finalClozeText);

      dispatch(
        addCard({
          text: finalClozeText,
          type: "cloze",
          tags: [],
        })
      );

      // successToast(
      //   "Created Cloze Card",
      //   `Created a cloze card, used keywords: ${JSON.stringify(keywords)}`
      // );
    }
  }
}

export async function generateClozeCards(
  text,
  nClozes,
  customPrompt,
  language,
  dispatch
) {
  let sentences = splitIntoSentences(text);
  for (let sentence of sentences) {
    await generateClozeCardFromSentence(
      sentence,
      nClozes,
      customPrompt,
      language,
      dispatch
    );
  }
}

export async function generateCards(
  text,
  customPrompt = "",
  cardType = "basic",
  language = store.getState().language.value,
  dispatch = store.dispatch
) {
  dispatch(setMakeCardsLoading(true));
  try {
    if (isLocalMode()) {
      let res = await pyGenerateCards(text, customPrompt, cardType, language);
      dispatch(setMakeCardsLoading(false));

      let cardsRawString = res.cardsRawString;
      if (cardsRawString) {
        handleCardsRawString(cardsRawString, cardType, dispatch);
      }
    } else {
      // TODO: remove this temp redirection for debugging
      if (cardType === "cloze") {
        await generateClozeCards(text, 2, customPrompt, language, dispatch);
        return;
      }

      let res = await generateCardsRequest(
        text,
        customPrompt,
        cardType,
        language
      );

      dispatch(setMakeCardsLoading(false));
      if (res.status === "success") {
        dispatch(updateUser(res.data.user));
        let rawString = res.data.response.content;
        handleCardsRawString(rawString, cardType, dispatch);
      }
    }
  } catch (err) {
    errorToast("Error Making Cards", err.message);
  }
}

export function setSampleCards() {
  const sampleCards = [
    {
      text: "This is a {{c1::test}} cloze card",
      type: "cloze",
      tags: ["ankibrain", "cloze"],
    },
    {
      text: "This is a {{c1::test}} cloze card #2",
      type: "cloze",
      tags: ["ankibrain", "cloze"],
    },
    {
      text: "This is a {{c1::test}} cloze card #3",
      type: "cloze",
      tags: ["ankibrain", "cloze"],
    },
    {
      front: "basic card front text",
      back: "basic card back text",
      type: "basic",
      tags: ["ankibrain", "basic"],
    },
    {
      front: "basic card front text #2",
      back: "basic card back text #2",
      type: "basic",
      tags: ["ankibrain", "basic"],
    },
    {
      front: "basic card front text #3",
      back: "basic card back text #3",
      type: "basic",
      tags: ["ankibrain", "basic"],
    },
  ];

  store.dispatch(setCards(sampleCards));
}
