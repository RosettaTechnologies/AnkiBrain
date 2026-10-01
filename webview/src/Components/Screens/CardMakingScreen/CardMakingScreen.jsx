import "./CardMakingScreen.css";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
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
import { addImages } from "../../../api/redux/slices/imagesRegistry";
import {
  setDocumentContext,
} from "../../../api/redux/slices/documentContext";
import {
  pyResolveImages,
  collectCardImageIds,
} from "../../../api/PythonBridge/senders/pyResolveImages";
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
import {
  batchChunksWithImages,
  getCardGenChunkSize,
} from "../../../api/batching";
import { CustomPromptMakeCardsModal } from "./CustomPromptMakeCardsModal";
import { EditableCard } from "./EditableCard";
import { ImagePickerModal } from "./ImagePickerModal";
import { DocumentImageLibrary } from "./DocumentImageLibrary";

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
  const imagesById = useSelector((state) => state.imagesRegistry.value);
  const documentContext = useSelector((state) => state.documentContext.value);

  // The card whose image picker is open (null = closed). Manual image adds
  // are uncapped; the picker lists every image found in any processed
  // document so cards can pull from earlier runs too.
  const [pickerCardIndex, setPickerCardIndex] = useState(null);

  const allImages = useMemo(() => Object.values(imagesById), [imagesById]);

  // How many cards each image is currently attached to — powers the library
  // badges and lets the picker show "on N cards".
  const usageCounts = useMemo(() => {
    const counts = {};
    for (let card of cards) {
      for (let imageId of card.images || []) {
        counts[imageId] = (counts[imageId] || 0) + 1;
      }
    }
    return counts;
  }, [cards]);

  // Images from the most recently processed document first (ids are
  // "runId/filename"), then anything left over from earlier runs.
  const sortedImages = useMemo(() => {
    if (!documentContext.runId) {
      return allImages;
    }
    const prefix = documentContext.runId + "/";
    const current = allImages.filter((image) => image.id.startsWith(prefix));
    const others = allImages.filter((image) => !image.id.startsWith(prefix));
    return [...current, ...others];
  }, [allImages, documentContext.runId]);

  // Persist manual card edits (text, tags, image adds/removals) so the
  // review list survives closing and reopening Anki. Generation paths
  // already saved tempCards; edits until now did not.
  const debouncedSaveTempCards = useRef(
    debounce((cardsCopy) => {
      pyEditSetting("tempCards", cardsCopy);
    }, 700)
  ).current;

  useEffect(() => {
    debouncedSaveTempCards(cloneDeep(cards));
  }, [cards]);

  // After a restart the registry is empty while restored cards still carry
  // ids; ask python to resolve what survives in media_tmp so their previews
  // (and the picker) work again. Each id is attempted once per session —
  // ids purged from media_tmp will never resolve, so don't re-ask on every
  // keystroke.
  const imageResolveAttemptedRef = useRef(new Set());

  useEffect(() => {
    const missing = collectCardImageIds(cards).filter(
      (imageId) => !imageResolveAttemptedRef.current.has(imageId)
    );
    if (missing.length === 0) {
      return;
    }
    for (let imageId of missing) {
      imageResolveAttemptedRef.current.add(imageId);
    }
    pyResolveImages(missing);
  }, [cards]);

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

  // One image id -> one card. Manual inserts are uncapped and deduped.
  const handleInsertImage = (imageId, cardIndex) => {
    modifyCard(cardIndex, (c) => {
      let cardCopy = cloneDeep(c);
      cardCopy.images = [...new Set([...(cardCopy.images || []), imageId])];
      return cardCopy;
    });
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
      let splitResult = await splitDocument(dispatch);
      if (!splitResult || !splitResult.chunks) {
        dispatch(setMakeCardsLoading(false));
        return;
      }

      let chunks = splitResult.chunks;
      if (typeof chunks === "string") {
        chunks = JSON.parse(chunks);
      }
      let images = splitResult.images || [];

      // Keep extracted images available for previews and for ADD_CARDS,
      // which resolves ids to files in media_tmp.
      dispatch(addImages(images));

      // Record what this run found so the tab can show a status line and so
      // the library/picker can sort "images from this document" first.
      dispatch(
        setDocumentContext({
          docName: splitResult.doc
            ? splitResult.doc.file_name_with_extension ||
              splitResult.doc.file_name ||
              ""
            : "",
          runId: images.length > 0 ? images[0].id.split("/")[0] : "",
          chunksCount: chunks.length,
          imagesCount: images.length,
        })
      );

      const model = store.getState().appSettings.ai.llmModel;
      const maxCharsPerBatch = getCardGenChunkSize(model);
      const batches = batchChunksWithImages(chunks, images, maxCharsPerBatch);

      dispatch(setMakeCardsLoading(false));
      successToast(
        "Processed Document",
        `Your document has been processed, 
                        now starting card generation for ${batches.length} sections of text.`
      );

      makeCardsFromDocStartTimeRef.current = Date.now();
      let finishedEntireDocument = true;
      for (let i = 0; i < batches.length; i++) {
        try {
          if (terminateMakingCardsFromDoc.current === true) {
            terminateMakingCardsFromDoc.current = false;
            finishedEntireDocument = false;
            break;
          }

          // In local mode, the chatAI just returns the text as the chunk itself
          // i.e. chunks: [str]
          let batch = batches[i];
          let progress = (i / (batches.length - 1)) * 100;
          setMakeCardsFromDocProgress(progress.toFixed(2));

          // With images, send the "[Chunk N]"-labeled text so the model
          // cites each card's source chunk and images attach per-card.
          // Without images the assignment is null and the plain batch
          // text keeps the historical prompt exactly.
          const hasImages = batch.images && batch.images.length > 0;
          await generateCards(
            hasImages ? batch.promptText : batch.text,
            customPromptMakeCards,
            selectedCardType,
            language,
            dispatch,
            hasImages
              ? {
                  images: batch.images,
                  chunkStart: batch.chunkStart,
                  chunkEnd: batch.chunkEnd,
                }
              : null
          );
          dispatch(setMakeCardsLoading(true));

          if (i > 0 && makeCardsFromDocStartTimeRef.current !== null) {
            const elapsedTime =
              (Date.now() - makeCardsFromDocStartTimeRef.current) / 1000; // convert ms -> s
            const averageTimePerIteration = elapsedTime / i;
            const predictedTotalTime = averageTimePerIteration * batches.length;
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
            <Tab>From Documents</Tab>
            <Tab>From Text</Tab>
            {failedCards.length > 0 && <Tab>Failed Cards</Tab>}
          </TabList>
          <TabPanels>
            <TabPanel>
              <VStack align={"stretch"} spacing={4}>
                <Flex direction={"row"} align={"center"} flexWrap={"wrap"}>
                  <Button
                    width={325}
                    variant={"accent"}
                    isDisabled={makeCardsLoading}
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

                  <Flex
                    direction={"column"}
                    p={0}
                    m={0}
                    ms={4}
                    mt={{ base: 2, lg: 0 }}
                  >
                    <Text fontSize={10} color={"gray"} p={0} m={0}>
                      Max {isLocalMode() ? "1 GB" : "100 MB"} per file. Every
                      image embedded in your document is collected below, so
                      you can insert images into cards before adding them to
                      Anki.
                    </Text>
                    {automaticallyAddCards && (
                      <Text fontSize={10} color={"gray"} p={0} m={0}>
                        Every 100 cards will automatically be added to Anki
                        (change this in Settings)
                      </Text>
                    )}
                  </Flex>
                </Flex>

                {makeCardsLoading && (
                  <Flex direction={"column"}>
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

                {documentContext.docName && (
                  <Flex
                    direction={"row"}
                    align={"center"}
                    flexWrap={"wrap"}
                    p={2}
                    borderRadius={"md"}
                    backgroundColor={
                      colorMode === "light"
                        ? "rgba(0, 0, 0, 0.05)"
                        : "customPurple.800"
                    }
                  >
                    <Text fontSize={12}>
                      Last processed: <b>{documentContext.docName}</b>
                    </Text>
                    <Text fontSize={12} color={"gray"} ms={4}>
                      {documentContext.chunksCount} text sections ·{" "}
                      {documentContext.imagesCount} images found
                    </Text>
                  </Flex>
                )}

                <DocumentImageLibrary
                  images={sortedImages}
                  usageCounts={usageCounts}
                  cards={cards}
                  onInsert={handleInsertImage}
                />
              </VStack>
            </TabPanel>
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

        <Box mt={2} px={5}>
          <Heading size={"sm"}>Review & edit cards ({cards.length})</Heading>
          <Text fontSize={12} color={"gray"}>
            Edit text and tags, or add/remove images on each card before
            adding them to Anki. Images always appear on the answer side.
          </Text>
        </Box>

        <Box maxHeight={600} overflowY={"auto"} p={5}>
          {cards.map((card, i) => (
            <EditableCard
              key={i}
              card={card}
              index={i}
              imagesById={imagesById}
              modifyCard={modifyCard}
              onDelete={(index) => {
                store.dispatch(deleteCardAtIndex(index));
              }}
              onOpenImagePicker={(index) => {
                setPickerCardIndex(index);
              }}
            />
          ))}
        </Box>

        <ImagePickerModal
          isOpen={pickerCardIndex !== null}
          onClose={() => {
            setPickerCardIndex(null);
          }}
          images={sortedImages}
          currentImages={
            pickerCardIndex !== null && cards[pickerCardIndex]
              ? cards[pickerCardIndex].images || []
              : []
          }
          usageCounts={usageCounts}
          onConfirm={(newImageIds) => {
            if (pickerCardIndex === null) {
              return;
            }
            modifyCard(pickerCardIndex, (c) => {
              let cardCopy = cloneDeep(c);
              cardCopy.images = [...new Set(newImageIds)];
              return cardCopy;
            });
          }}
        />
      </div>
    </div>
  );
}
