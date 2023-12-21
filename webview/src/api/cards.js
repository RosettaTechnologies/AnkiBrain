import {pyGenerateCards} from "./PythonBridge/senders/pyGenerateCards";
import {store, updateUser} from "./redux";
import {addCards, setCards} from "./redux/slices/cards";
import {isLocalMode} from "./user";
import {setMakeCardsLoading} from "./redux/slices/makeCardsText";
import {generateCardsRequest} from "./server-api/cards";
import {errorToast, infoToast, successToast} from "./toast";
import nlp from "compromise";
import {addFailedCards} from "./redux/slices/failedCards";
import {pyEditSetting} from "./PythonBridge/senders/pyEditSetting";
import {postChat} from "./server-api/networking/chat";

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
    // dispatch(
    //   setAppAlertModal({
    //     show: true,
    //     header: "Cards JSON",
    //     alertText: (
    //       <Flex direction={"column"}>
    //         <Text>
    //           The AI failed to format your cards properly. The raw json output
    //           from the AI is below, you can try editing it to fix the syntax.
    //           You can later paste the fixed json into the "edit cards JSON"
    //           field to create these cards. Make sure each card has fields for
    //           "type: str", "tags: [str]". If basic type then the card should
    //           have "front" and "back" fields, while if cloze it should have a
    //           singular "text" field instead.
    //         </Text>
    //         <Textarea value={rawString} />
    //       </Flex>
    //     ),
    //   })
    // );
  }
}

// TODO in progress
function buildClozeCardQuery(text, nClozes, customPrompt, language = "English") {
  return `
    Please pick ${nClozes} of the most important words or phrases in the following ${language} sentence.
            
    "${text}"
    
    Please respond in ${language}. Please respond using valid JSON array syntax.
    
    ${customPrompt ? "Additionally: " + customPrompt : ""}
    `;
}

// TODO in progress
export async function generateClozeCards(text, nClozes, customPrompt = "", language = store.getState().language.value, dispatch = store.dispatch) {
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
    )

    if (res.status === 'success') {
      let rawString = res.data.response.content;
    }
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
