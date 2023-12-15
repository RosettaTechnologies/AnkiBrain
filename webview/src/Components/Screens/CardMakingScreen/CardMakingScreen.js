import "./CardMakingScreen.css";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useRef, useState } from "react";
import { cloneDeep, debounce } from "lodash";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCloseButton,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  Heading,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Select,
  Spacer,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Textarea,
  useColorMode,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { pyAddCards } from "../../../api/PythonBridge/senders/pyAddCards";
import { AddIcon, DeleteIcon, StarIcon } from "@chakra-ui/icons";
import { generateCards } from "../../../api/cards";
import { deleteCardAtIndex, setCards } from "../../../api/redux/slices/cards";
import { setBoolShowCardsJsonEditor } from "../../../api/redux/slices/bShowCardsJsonEditor";
import {
  setMakeCardsLoading,
  setMakeCardsText,
} from "../../../api/redux/slices/makeCardsText";
import { errorToast, infoToast, successToast } from "../../../api/toast";
import { splitDocument } from "../../../api/documents";
import { isLocalMode } from "../../../api/user";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";
import { store } from "../../../api/redux";
import { CustomPromptMakeCardsModal } from "./CustomPromptMakeCardsModal";

function ClearCardsAlert(props) {
  const cancelRef = useRef();
  return (
    <AlertDialog
      leastDestructiveRef={cancelRef}
      isOpen={props.isOpen}
      onClose={props.onCancel}
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize={"lg"} fontWeight={"bold"}>
            Clear All Cards
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>Are you sure? You can't undo this action. </Text>
            <Text>
              <b>Note</b>: this only clears cards in AnkiBrain, not Anki.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={props.onCancel}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={props.onOK} ml={3}>
              Clear All
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

function renderCard(card, key, modifyCard) {
  const { colorMode } = useColorMode();
  return (
    <Card
      mb={3}
      backgroundColor={colorMode === "light" ? "offWhite" : "customPurple.800"}
      color={colorMode === "light" ? "customBlack" : "white"}
    >
      <CardBody>
        <Flex flexDirection={"row"}>
          <Flex
            width={"100%"}
            height={"100%"}
            flexDirection={"row"}
            justifyContent={"center"}
            alignItems={"center"}
            mb={5}
          >
            <Box>
              <Tag me={5}>{card.type}</Tag>
            </Box>
            <Spacer />
            <VStack alignSelf={"center"}>
              <VStack mb={15}>
                <Heading size={"sm"}>
                  {card.type === "basic" ? "Front" : ""}
                </Heading>
                <Text>{card.type === "basic" ? card.front : card.text}</Text>
              </VStack>

              <VStack mb={15}>
                <Heading size={"sm"}>
                  {card.type === "basic" ? "Back" : ""}
                </Heading>
                <Text>{card.type === "basic" ? card.back : ""}</Text>
              </VStack>
            </VStack>
            <Spacer />

            <Flex maxWidth={"50%"} justifyContent={"end"} flexWrap={"wrap"}>
              {card.tags.map((tag, tagIndex) => (
                <Tag size={"lg"} me={2} mb={2} colorScheme={"green"}>
                  <TagLabel>{tag}</TagLabel>
                  <TagCloseButton
                    onClick={(e) => {
                      e.preventDefault();
                      modifyCard(key, () => {
                        let cardCopy = cloneDeep(card);
                        cardCopy.tags.splice(tagIndex, 1);
                        return cardCopy;
                      });
                    }}
                  />
                </Tag>
              ))}
            </Flex>
          </Flex>
          <Flex>
            <Button
              colorScheme={"red"}
              onClick={() => {
                store.dispatch(deleteCardAtIndex(key));
              }}
            >
              Delete
            </Button>
          </Flex>
        </Flex>
      </CardBody>
    </Card>
  );
}

export function CardMakingScreen() {
  const dispatch = useDispatch();
  const [tempCardsJson, setTempCardsJson] = useState("");
  const topicExplanation = useSelector((state) => state.topicExplanation.value);
  const bShowCardsJsonEditor = useSelector(
    (state) => state.bShowCardsJsonEditor.value
  );
  const { colorMode } = useColorMode();

  const makeCardsText = useSelector((state) => state.makeCardsText.value);
  const makeCardsLoading = useSelector((state) => state.makeCardsText.loading);

  const cards = useSelector((state) => state.cards.value);
  const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);

  // Array of raw cards strings (malformed json strings)
  const failedCards = useSelector((state) => state.failedCards.value);

  const [deck, setDeck] = useState("");
  const [tag, setTag] = useState("");
  const [showClearCardsAlert, setShowClearCardsAlert] = useState(false);
  const [showMakeCardsFromDocumentAlert, setShowMakeCardsFromDocumentAlert] =
    useState(false);
  const cancelRef = useRef();
  const [selectedCardType, setSelectedCardType] = useState("basic");
  const customPromptMakeCards = useSelector(
    (state) => state.customPrompts.value.makeCards
  );
  const toast = useToast();

  const [makeCardsFromDocProgress, setMakeCardsFromDocProgress] = useState(0);
  const makeCardsFromDocStartTimeRef = useRef(null);

  const [eta, setEta] = useState(null);

  const model = useSelector((state) => state.appSettings.ai.llmModel);
  const temperature = useSelector((state) => state.appSettings.ai.temperature);
  const terminateMakingCardsFromDoc = useRef(false);
  const language = useSelector((state) => state.language.value);
  const automaticallyAddCards = useSelector(
    (state) => state.automaticallyAddCards.value
  );
  const deleteCardsAfterAdding = useSelector(
    (state) => state.deleteCardsAfterAdding.value
  );

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const debouncedCardsTextChangeHandler = debounce((value) => {
    dispatch(setMakeCardsText(value));
  }, 500);

  const modifyCard = (i, fn) => {
    let cardsCopy = cloneDeep(cards);
    cardsCopy[i] = fn(cardsCopy[i]);
    dispatch(setCards(cardsCopy));
  };

  const handleClearCards = async () => {
    dispatch(setCards([]));
    await pyEditSetting("tempCards", []);
    successToast("Cards Cleared", "Your cards have been cleared.");
  };

  const clearAllTags = () => {
    let cardsCopy = cloneDeep(cards);
    for (let card of cardsCopy) {
      card.tags = [];
    }

    dispatch(setCards(cardsCopy));
  };

  const handleAddTag = () => {
    if (tag === "") {
      return;
    }

    if (tag.includes(" ")) {
      toast({
        title: "Invalid Tag",
        description: "Tags cannot contain spaces.",
        status: "error",
        isClosable: true,
      });

      return;
    }

    let cardsCopy = cloneDeep(cards);
    for (let card of cardsCopy) {
      card.tags.push(tag);
    }
    setTag("");
    dispatch(setCards(cardsCopy));
  };

  const handleMakeCards = async (
    text,
    customPrompt = "",
    cardType = "basic"
  ) => {
    await generateCards(
      text,
      customPromptMakeCards,
      cardType,
      language,
      dispatch
    );
  };

  useEffect(() => {
    if (!bShowCardsJsonEditor) return;
    setTempCardsJson(JSON.stringify(cards));
  }, [bShowCardsJsonEditor]);

  useEffect(() => {
    (async function () {
      // If we have > 100 cards in the collection now, add to anki and clear the cards. (if user settings allow)
      if (automaticallyAddCards && cards.length > 100) {
        // Make sure global tag is applied.
        infoToast(
          "Automatically Adding Cards",
          "You have over 100 cards, automatically adding them to Anki."
        );

        const cardsCopy = cloneDeep(cards);
        for (let card of cardsCopy) {
          if (!card.tags.includes(tag)) {
            card.tags.push(tag);
          }
        }

        // Always clear cards.
        await pyAddCards(cardsCopy, deck, true);
      }
    })();
  }, [cards]);

  const handleEditModalClose = () => {
    try {
      const newCards = JSON.parse(tempCardsJson);
      dispatch(setCards(newCards));
      dispatch(setBoolShowCardsJsonEditor(false));
    } catch (e) {
      // TODO alert the user
      window.alert(e);
    }
  };

  function sanitizeJSON(jsonString) {
    // Replace control characters with their escaped equivalents
    let sanitizedString = jsonString
      .replace(/[\b]/g, "\\b")
      .replace(/\f/g, "\\f")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/"/g, '\\"')
      .replace(/[^\x20-\x7E]/g, "");
    return sanitizedString;
  }

  async function makeCardsFromDocument() {
    if (makeCardsLoading) {
      return;
    }

    // Same implementation for local/server modes.
    try {
      dispatch(setMakeCardsLoading(true));
      let chunks = await splitDocument(dispatch);
      if (!chunks) {
        dispatch(setMakeCardsLoading(false));
        return;
      }

      if (typeof chunks === "string") {
        chunks = JSON.parse(chunks);
      }

      dispatch(setMakeCardsLoading(false));
      successToast(
        "Processed Document",
        `Your document has been processed, 
                        now starting card generation for ${chunks.length} chunks of text.`
      );

      makeCardsFromDocStartTimeRef.current = Date.now();
      let finishedEntireDocument = true;
      for (let i = 0; i < chunks.length; i++) {
        try {
          if (terminateMakingCardsFromDoc.current === true) {
            terminateMakingCardsFromDoc.current = false;
            finishedEntireDocument = false;
            break;
          }

          let chunk = chunks[i];

          // In local mode, the chatAI just returns the text as the chunk itself
          // i.e. chunks: [str]
          let text = chunk;
          let progress = (i / (chunks.length - 1)) * 100;
          setMakeCardsFromDocProgress(progress.toFixed(2));
          await generateCards(
            text,
            customPromptMakeCards,
            selectedCardType,
            language,
            dispatch
          );
          dispatch(setMakeCardsLoading(true));

          if (i > 0 && makeCardsFromDocStartTimeRef.current !== null) {
            const elapsedTime =
              (Date.now() - makeCardsFromDocStartTimeRef.current) / 1000; // convert ms -> s
            const averageTimePerIteration = elapsedTime / i;
            const predictedTotalTime = averageTimePerIteration * chunks.length;
            const eta = predictedTotalTime - elapsedTime;
            setEta(eta);
          }
        } catch (err) {
          errorToast("Error", err.message);
        }
      }

      dispatch(setMakeCardsLoading(false));

      if (finishedEntireDocument) {
        successToast(
          "Finished Processing",
          "Finished processing your document. All cards have been added.",
          3000
        );
      }
    } catch (err) {
      errorToast("Error", err.message);
    } finally {
      dispatch(setMakeCardsLoading(false));
    }
  }

  return (
    <div className={"CardMakingScreen"}>
      <div style={{ height: "100%", width: "100%" }}>
        <ClearCardsAlert
          isOpen={showClearCardsAlert}
          onCancel={() => {
            setShowClearCardsAlert(false);
          }}
          onOK={async () => {
            await handleClearCards();
            setShowClearCardsAlert(false);
          }}
        />

        <AlertDialog
          leastDestructiveRef={cancelRef}
          isOpen={showMakeCardsFromDocumentAlert}
          onClose={() => {
            setShowMakeCardsFromDocumentAlert(false);
          }}
        >
          <AlertDialogOverlay>
            <AlertDialogContent>
              <AlertDialogHeader>
                <Text>Make Cards From Document</Text>
                <AlertDialogCloseButton />
              </AlertDialogHeader>
              <AlertDialogBody>
                <Text>
                  AnkiBrain can make cards out of an entire document up to{" "}
                  {isLocalMode() ? "1 GB" : "100 MB"} in size.
                </Text>
                <Text>
                  AnkiBrain will read <b>every single word</b> in your document,
                  including author names, table of contents, indices, etc.
                </Text>
                <Text fontSize={24}>
                  To reduce junk cards, <b>you must remove irrelevant pages</b>{" "}
                  from your document!
                </Text>
              </AlertDialogBody>
              <AlertDialogFooter>
                <Button
                  me={5}
                  ref={cancelRef}
                  onClick={() => {
                    setShowMakeCardsFromDocumentAlert(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant={"accent"}
                  onClick={async () => {
                    setShowMakeCardsFromDocumentAlert(false);
                    await makeCardsFromDocument();
                  }}
                >
                  I understand, proceed
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>

        <CustomPromptMakeCardsModal
          isOpen={showCustomPromptModal}
          onClose={() => {
            setShowCustomPromptModal(false);
          }}
        />

        <Modal isOpen={bShowCardsJsonEditor} onClose={handleEditModalClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Edit Cards JSON</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Textarea
                value={tempCardsJson}
                onChange={(e) => {
                  setTempCardsJson(e.target.value);
                }}
              />
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="blue" mr={3} onClick={handleEditModalClose}>
                Close
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <Flex direction={"row"} justifyContent={"center"}>
          <Text color={"gray"} fontSize={12} me={3}>
            Model: {model}
          </Text>
          <Text color={"gray"} fontSize={12} me={3}>
            Temperature: {temperature}
          </Text>
          <Text fontSize={12} color={"gray"}>
            Language: {language}
          </Text>
        </Flex>

        <Tabs>
          <TabList>
            <Tab>From Text</Tab>
            <Tab>From Documents</Tab>
            {failedCards.length > 0 && <Tab>Failed Cards</Tab>}
          </TabList>
          <TabPanels>
            <TabPanel>
              <Flex direction={"column"}>
                <Textarea
                  bg={colorMode === "light" ? "white" : "customPurple.800"}
                  focusBorderColor={"accent"}
                  mt={1}
                  style={{ minHeight: 200 }}
                  onChange={(event) => {
                    const text = event.target.value;
                    const currentWordCount = text.trim().split(/\s+/).length;
                    if (currentWordCount < 750) {
                      debouncedCardsTextChangeHandler(text);
                    }
                  }}
                  placeholder={
                    "You can generate in Topic Explanation or copy-paste any information into here..."
                  }
                >
                  {makeCardsText}
                </Textarea>
                <Text
                  alignSelf={"end"}
                  fontSize={12}
                  color={"gray"}
                  p={0}
                  m={0}
                >
                  {makeCardsText.trim().split(/\s+/).length}/750
                </Text>
              </Flex>

              <Button
                variant={"accent"}
                isDisabled={makeCardsText === "" || makeCardsLoading}
                onClick={async () => {
                  if (makeCardsText.trim().split(/\s+/).length <= 750) {
                    await handleMakeCards(
                      makeCardsText,
                      customPromptMakeCards,
                      selectedCardType
                    );
                  } else {
                    errorToast("Too many tokens");
                  }
                }}
                width={250}
              >
                <Flex flexDirection={"row"} alignItems={"center"}>
                  {makeCardsLoading ? (
                    <Spinner />
                  ) : (
                    <>
                      <StarIcon me={3} />
                      Make Cards From Text
                    </>
                  )}
                </Flex>
              </Button>
              {automaticallyAddCards && (
                <>
                  <Text fontSize={10} color={"gray"} p={0} m={0}>
                    Every 100 cards will automatically be added to Anki (change
                    this in Settings)
                  </Text>
                </>
              )}
            </TabPanel>
            <TabPanel>
              <Button
                mt={3}
                width={325}
                variant={"accent"}
                onClick={() => {
                  setShowMakeCardsFromDocumentAlert(true);
                }}
              >
                <Flex flexDirection={"row"} alignItems={"center"}>
                  {makeCardsLoading ? (
                    <Spinner />
                  ) : (
                    <>
                      <AddIcon me={3} />
                      Make Cards From Entire Document
                    </>
                  )}
                </Flex>
              </Button>

              <Flex direction={"column"} p={0} m={0}>
                <Text fontSize={10} color={"gray"} p={0} m={0}>
                  Max {isLocalMode() ? "1 GB" : "100 MB"} per file.{" "}
                </Text>
                {automaticallyAddCards && (
                  <Text fontSize={10} color={"gray"} p={0} m={0}>
                    Every 100 cards will automatically be added to Anki (change
                    this in Settings)
                  </Text>
                )}
              </Flex>

              {makeCardsLoading && (
                <Flex direction={"column"} mt={3}>
                  <Tag
                    justifyContent={"center"}
                    alignSelf={"center"}
                    width={325}
                  >
                    Document Processing: {makeCardsFromDocProgress}% (ETA:{" "}
                    {formatTime(eta)})
                  </Tag>
                  <Progress
                    mt={1}
                    mb={3}
                    hasStripe
                    value={makeCardsFromDocProgress}
                  />

                  <Button
                    alignSelf={"center"}
                    width={325}
                    mt={2}
                    colorScheme={"red"}
                    onClick={() => {
                      infoToast(
                        "Processing Will Stop",
                        "Your document will stop processing after the current chunk is finished."
                      );
                      terminateMakingCardsFromDoc.current = true;
                    }}
                  >
                    Stop
                  </Button>
                </Flex>
              )}
            </TabPanel>
            <TabPanel>
              <Flex
                direction={"column"}
                maximumHeight={1000}
                overflowY={"scroll"}
              >
                {failedCards.map((rawString) => (
                  <Text mb={5}>{rawString}</Text>
                ))}
              </Flex>
            </TabPanel>
          </TabPanels>
        </Tabs>

        <Flex flexDirection={"column"} alignItems={"center"}>
          <Flex direction={"row"}>
            <Tag borderRightRadius={0} width={150} justifyContent={"center"}>
              Card Type
            </Tag>
            <Select
              value={selectedCardType}
              onChange={(e) => {
                setSelectedCardType(e.target.value);
              }}
            >
              <option value={"basic"}>Basic</option>
              <option value={"cloze"}>Cloze</option>
            </Select>
          </Flex>
        </Flex>

        <Button
          mt={5}
          onClick={() => {
            setShowCustomPromptModal(true);
          }}
        >
          Customize Prompt
        </Button>

        <Flex
          justifyContent={"center"}
          mt={5}
          flexWrap={{
            base: "wrap",
            lg: "nowrap",
          }}
        >
          <InputGroup alignSelf={"center"} width={350} me={5}>
            <InputLeftAddon children={"Deck Name (optional)"} />
            <Input
              placeholder={"Deck to add cards to..."}
              value={deck}
              onChange={(e) => {
                setDeck(e.target.value);
              }}
            />
          </InputGroup>
          <InputGroup width={350} mt={{ base: 2.5, lg: 0 }}>
            <InputLeftAddon children={"Global Tag"} />
            <Input
              placeholder={"Tag to add..."}
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTag();
                }
              }}
            />
            <InputRightAddon
              p={0}
              children={<Button onClick={handleAddTag}>Add</Button>}
            />
          </InputGroup>
        </Flex>
        <Flex
          mt={5}
          mb={5}
          justifyContent={"center"}
          flexWrap={{
            base: "wrap",
            lg: "nowrap",
          }}
        >
          <Button
            variant={"secondary"}
            isDisabled={cards.length <= 0}
            onClick={async () => {
              // Make sure global tag is applied.
              const cardsCopy = cloneDeep(cards);
              for (let card of cardsCopy) {
                if (!card.tags.includes(tag)) {
                  card.tags.push(tag);
                }
              }

              await pyAddCards(cardsCopy, deck, deleteCardsAfterAdding);
            }}
            me={5}
          >
            <AddIcon me={3} />
            Add Cards To Anki
          </Button>

          <Button
            me={5}
            onClick={() => {
              setShowClearCardsAlert(true);
            }}
          >
            <DeleteIcon me={3} />
            Clear All Cards ({cards.length})
          </Button>

          <Button onClick={clearAllTags} me={5} mt={{ base: 2.5, lg: 0 }}>
            <DeleteIcon me={3} />
            Clear All Tags
          </Button>

          <Button
            onClick={() => {
              dispatch(setBoolShowCardsJsonEditor(true));
            }}
            mt={{ base: 2.5, lg: 0 }}
          >
            Edit Cards (JSON)
          </Button>
        </Flex>

        <Box maxHeight={500} overflowY={"auto"} p={5}>
          {cards.map((card, i) => renderCard(card, i, modifyCard))}
        </Box>
      </div>
    </div>
  );
}
