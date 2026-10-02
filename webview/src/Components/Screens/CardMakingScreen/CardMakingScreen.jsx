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
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Heading,
  Input,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Select,
  Spinner,
  Text,
  Textarea,
  useBreakpointValue,
  useToast,
} from "@chakra-ui/react";
import { useColorMode } from "../../../theme/colorMode";
import { pyAddCards } from "../../../api/PythonBridge/senders/pyAddCards";
import {
  AddIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  InfoIcon,
  SettingsIcon,
  StarIcon,
} from "@chakra-ui/icons";
import { RiPriceTag3Line } from "react-icons/ri";
import { VscUnmute } from "react-icons/vsc";
import { generateCards } from "../../../api/cards";
import { deleteCardAtIndex, setCards } from "../../../api/redux/slices/cards";
import { addImages, clearImages } from "../../../api/redux/slices/imagesRegistry";
import {
  buildAudioItems,
  cancelAllCardAudio,
  cancelCardAudio,
} from "../../../api/cardAudio";
import { requestAudioGeneration } from "../../../api/PythonBridge/senders/pyGenerateCardAudio";
import {
  collectCardAudioIds,
  pyResolveAudioIds,
} from "../../../api/PythonBridge/senders/pyResolveAudioIds";
import { countGenerating } from "../../../api/redux/slices/cardAudio";
import { editTtsSettingLocal } from "../../../api/redux/slices/tts";
import {
  setDocumentContext,
} from "../../../api/redux/slices/documentContext";
import {
  pyResolveImages,
  collectCardImageIds,
} from "../../../api/PythonBridge/senders/pyResolveImages";
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

/*
 * Confirmation for the images sidebar's "Clear All" button. Mirrors
 * ClearCardsAlert; notes when images are currently attached to cards, since
 * clearing detaches them too.
 */
function ClearImagesAlert(props) {
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
            Clear All Images
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>Are you sure? You can't undo this action.</Text>
            {props.usedImageCount > 0 && (
              <Text>
                <b>Note</b>: this also detaches {props.usedImageCount}{" "}
                image{props.usedImageCount === 1 ? "" : "s"} currently inserted
                on cards.
              </Text>
            )}
            <Text>
              <b>Note</b>: this only clears images in AnkiBrain, not Anki.
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

/*
 * One non-breaking group of toolbar controls. The toolbar wraps between
 * groups at narrow widths, never inside one.
 */
function ToolbarGroup(props) {
  return (
    <Flex gap={1.5} align={"center"} flexShrink={0} {...props}>
      {props.children}
    </Flex>
  );
}

export function CardMakingScreen() {
  const dispatch = useDispatch();
  const topicExplanation = useSelector((state) => state.topicExplanation.value);
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
  const [showClearImagesAlert, setShowClearImagesAlert] = useState(false);
  const [showMakeCardsFromDocumentAlert, setShowMakeCardsFromDocumentAlert] =
    useState(false);
  const cancelRef = useRef();
  const [selectedCardType, setSelectedCardType] = useState("basic");
  const customPromptMakeCards = useSelector(
    (state) => state.customPrompts.value.makeCards
  );
  const toast = useToast();

  // Which editor view is active. Replaces the old Tabs; the segment buttons
  // live in the toolbar so all page actions sit in one wrapping strip.
  const [view, setView] = useState("documents");

  // The extracted-images side panel. Expanded by default; on narrow windows
  // it floats as an overlay drawer instead of a fixed column. Separate
  // states because the breakpoint resolves to "base" for a frame on mount,
  // and an auto-opened drawer would cover the previewer at startup.
  const [showImagesPanel, setShowImagesPanel] = useState(true);
  const [imagesDrawerOpen, setImagesDrawerOpen] = useState(false);
  const isDrawerMode = useBreakpointValue({ base: true, lg: false });
  const panelOpen = isDrawerMode ? imagesDrawerOpen : showImagesPanel;
  const toggleImagesPanel = () => {
    if (isDrawerMode) {
      setImagesDrawerOpen((v) => !v);
    } else {
      setShowImagesPanel((v) => !v);
    }
  };

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

  // AnkiBrain Voice (card audio): the review-screen mode drives auto-enqueue
  // of audio for freshly generated cards; the generating map gates Add-to-Anki.
  // There is no enable switch: auto-enqueue fires only while the engine is
  // available, and explicit clicks without it open the setup dialog.
  const ttsStatus = useSelector((state) => state.tts.status);
  const engineAvailable =
    !!ttsStatus &&
    (ttsStatus.status === "supported-and-installed" ||
      ttsStatus.status === "supported-and-needs-sync");
  const ttsCardAudioMode = useSelector(
    (state) => state.tts.settings.ttsCardAudioMode || "none"
  );
  const audioGenerating = useSelector((state) => state.cardAudio.generating);
  const audioInFlight = useMemo(
    () => countGenerating(audioGenerating),
    [audioGenerating]
  );
  const appDidBoot = useSelector((state) => state.appDidBoot.value);

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

  // The Failed segment only exists while there are failed cards; if the last
  // one is fixed/cleared while that view is open, fall back to Documents.
  useEffect(() => {
    if (view === "failed" && failedCards.length === 0) {
      setView("documents");
    }
  }, [view, failedCards.length]);

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

  // Same re-hydration for card-audio ids (play/remove previews after a
  // restart); ids purged from media_tmp are pruned off the cards by the
  // sender, so those fields read as "no audio" and can be regenerated.
  const audioResolveAttemptedRef = useRef(new Set());

  useEffect(() => {
    const missing = collectCardAudioIds(cards).filter(
      (audioId) => !audioResolveAttemptedRef.current.has(audioId)
    );
    if (missing.length === 0) {
      return;
    }
    for (let audioId of missing) {
      audioResolveAttemptedRef.current.add(audioId);
    }
    pyResolveAudioIds(missing);
  }, [cards]);

  /*
   * Auto-enqueue: with a "Generate audio for …" mode selected, cards enroll
   * their eligible fields the moment they enter the review list — audio is
   * synthesized while the user reviews, never as a delay at Add-to-Anki time.
   *
   * Grandfathering matters: the seen-uid set is seeded from whatever cards
   * exist once the app has booted (tempCards restore), so reopening Anki
   * with hundreds of old cards can't storm the queue. Only cards generated
   * during this session auto-enroll. Editing a field clears its clip but
   * does NOT re-enroll automatically — that would resynthesize on every
   * keystroke; the edited field becomes eligible for the per-field button
   * or Apply-to-all instead.
   */
  const audioSeenUidsRef = useRef(null);

  useEffect(() => {
    if (!appDidBoot) {
      return;
    }
    if (audioSeenUidsRef.current === null) {
      audioSeenUidsRef.current = new Set(cards.map((c) => c.uid));
      return;
    }
    const seen = audioSeenUidsRef.current;
    const fresh = cards.filter((c) => c.uid && !seen.has(c.uid));
    for (const c of fresh) {
      seen.add(c.uid);
    }
    if (fresh.length === 0 || !engineAvailable || ttsCardAudioMode === "none") {
      // Engine absent/unknown: skip silently. Auto-enqueue is background
      // work — the setup dialog is only ever opened by an explicit click.
      return;
    }
    requestAudioGeneration(buildAudioItems(fresh, ttsCardAudioMode));
  }, [appDidBoot, cards, engineAvailable, ttsCardAudioMode]);

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
    // Cancel any queued audio before the cards (their uids) go away.
    if (audioInFlight > 0) {
      cancelAllCardAudio();
    }
    dispatch(setCards([]));
    await pyEditSetting("tempCards", []);
    successToast("Cards Cleared", "Your cards have been cleared.");
  };

  // "Clear All" in the images sidebar: empties the extracted-image registry
  // and detaches every reference from the pending cards in the same step.
  // Detaching matters: card previews resolve urls through the registry, and
  // the restart-resolve effect would otherwise try to re-fetch dangling ids.
  // The debounced tempCards save fires on the setCards change, so persistence
  // needs no extra call here.
  const handleClearAllImages = () => {
    dispatch(clearImages());
    const cardsCopy = cloneDeep(cards);
    for (const card of cardsCopy) {
      if (card.images && card.images.length > 0) {
        card.images = [];
      }
    }
    dispatch(setCards(cardsCopy));
    successToast(
      "Images Cleared",
      "Extracted images were removed from the library."
    );
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
    (async function () {
      // If we have > 100 cards in the collection now, add to anki and clear the cards. (if user settings allow)
      // Deferred while audio syntheses are in flight (same gate as the
      // manual Add-to-Anki button); the deps re-fire this once the queue
      // drains so bulk cleanup still happens, just not mid-clip. The count
      // is read live from the store because the auto-enqueue effect above
      // marks this batch's jobs in the same commit — the render closure's
      // audioInFlight value would be stale by one pass.
      const liveAudioJobs = countGenerating(store.getState().cardAudio.generating);
      if (automaticallyAddCards && cards.length > 100 && liveAudioJobs === 0) {
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
  }, [cards, audioInFlight]);

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
  };

  const handleAddCardsToAnki = async () => {
    // Make sure global tag is applied.
    const cardsCopy = cloneDeep(cards);
    for (let card of cardsCopy) {
      if (!card.tags.includes(tag)) {
        card.tags.push(tag);
      }
    }

    await pyAddCards(cardsCopy, deck, deleteCardsAfterAdding);
  };

  // TTS policy dropdown: persisted like the other voice settings. The mode
  // governs auto-enqueue for cards generated AFTER the change (restored /
  // pre-existing cards are grandfathered); "Generate audio" below applies it
  // to the current list retroactively.
  const handleAudioModeChange = async (newMode) => {
    dispatch(editTtsSettingLocal({ key: "ttsCardAudioMode", value: newMode }));
    await pyEditSetting("ttsCardAudioMode", newMode);
  };

  const handleGenerateAudioForAll = () => {
    const items = buildAudioItems(cards, ttsCardAudioMode);
    if (items.length === 0) {
      infoToast(
        "Card Audio",
        "Every eligible field already has audio (or is empty). Edit a field or remove its audio first to regenerate."
      );
      return;
    }
    requestAudioGeneration(items);
  };

  const handleMakeFromTextClick = async () => {
    if (makeCardsText.trim().split(/\s+/).length <= 750) {
      await handleMakeCards(makeCardsText, customPromptMakeCards, selectedCardType);
    } else {
      errorToast("Too many tokens");
    }
  };

  const libraryProps = {
    images: sortedImages,
    usageCounts,
    cards,
    onInsert: handleInsertImage,
    onClearAll: () => setShowClearImagesAlert(true),
    compact: true,
  };

  const segmentPill = (key, label) => (
    <Button
      size={"sm"}
      variant={view === key ? "accent" : "ghost"}
      fontWeight={view === key ? "bold" : "normal"}
      color={view === key ? "customBlack" : "gray"}
      boxShadow={view === key ? "0 0 0 2px rgba(243,206,255,0.35)" : "none"}
      borderRadius={"full"}
      px={5}
      onClick={() => setView(key)}
    >
      {label}
    </Button>
  );

  return (
    <div className={"CardMakingScreen"}>
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

      <ClearImagesAlert
        isOpen={showClearImagesAlert}
        usedImageCount={
          Object.values(usageCounts).filter((count) => count > 0).length
        }
        onCancel={() => {
          setShowClearImagesAlert(false);
        }}
        onOK={() => {
          handleClearAllImages();
          setShowClearImagesAlert(false);
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

      {/* ───────────────────────── Toolbar ───────────────────────── */}
      <Box
        className="card-toolbar"
        flexShrink={0}
        px={3}
        py={2}
        bg={colorMode === "light" ? "offWhite" : "customPurple.800"}
        borderBottomWidth={"1px"}
        borderBottomColor={
          colorMode === "light" ? "rgba(0,0,0,0.1)" : "customPurple.700"
        }
      >
        {/* Row 1: pill navigation — visually separate from the action strip */}
        <Flex
          align={"center"}
          gap={2}
          pb={2}
          mb={2}
          borderBottomWidth={"1px"}
          borderBottomColor={
            colorMode === "light" ? "rgba(0,0,0,0.08)" : "customPurple.700"
          }
        >
          {segmentPill("documents", "From Documents")}
          {segmentPill("text", "From Text")}
          {failedCards.length > 0 &&
            segmentPill("failed", `Failed Cards (${failedCards.length})`)}
        </Flex>

        {/* Row 2+: action strip, wraps between groups at narrow widths */}
        <Flex wrap={"wrap"} align={"center"} gap={2}>
          {/* Primary action (context-aware) + card type */}
          {view !== "failed" && (
            <ToolbarGroup>
              {view === "documents" ? (
                <Button
                  size={"sm"}
                  variant={"accent"}
                  isDisabled={makeCardsLoading}
                  onClick={() => {
                    setShowMakeCardsFromDocumentAlert(true);
                  }}
                >
                  {makeCardsLoading ? (
                    <>
                      <Spinner size={"sm"} me={2} />
                      Generating…
                    </>
                  ) : (
                    <>
                      <AddIcon me={2} />
                      Make Cards From Document
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  size={"sm"}
                  variant={"accent"}
                  isDisabled={makeCardsText === "" || makeCardsLoading}
                  onClick={handleMakeFromTextClick}
                >
                  {makeCardsLoading ? (
                    <>
                      <Spinner size={"sm"} me={2} />
                      Generating…
                    </>
                  ) : (
                    <>
                      <StarIcon me={2} />
                      Make Cards From Text
                    </>
                  )}
                </Button>
              )}
              <ToolbarGroup ms={1} h={"32px"} gap={2}>
                <Text
                  fontSize={12}
                  color={"gray"}
                  lineHeight={"32px"}
                  whiteSpace={"nowrap"}
                >
                  Type
                </Text>
                <Select
                  size={"sm"}
                  width={100}
                  value={selectedCardType}
                  onChange={(e) => {
                    setSelectedCardType(e.target.value);
                  }}
                >
                  <option value={"basic"}>Basic</option>
                  <option value={"cloze"}>Cloze</option>
                </Select>
              </ToolbarGroup>
            </ToolbarGroup>
          )}

          {/* Deck + global tag */}
          <ToolbarGroup>
            <Input
              size={"sm"}
              width={160}
              placeholder={"Deck (optional)"}
              value={deck}
              onChange={(e) => {
                setDeck(e.target.value);
              }}
            />
            <Input
              size={"sm"}
              width={140}
              placeholder={"Global tag"}
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
            <Button size={"sm"} onClick={handleAddTag} aria-label={"Apply tag"}>
              <AddIcon boxSize={3} />
            </Button>
          </ToolbarGroup>

          {/* Push the secondary cluster to the right on wide windows */}
          <Box flex={1} display={{ base: "none", xl: "block" }} />

          {/* Secondary actions */}
          <ToolbarGroup>
            {/* Adds are instant (no inline synthesis anymore), but stay
                locked while any card generation or audio job is still in
                flight — half-spoken cards must not sneak into the deck. */}
            <Button
              size={"xs"}
              variant={"secondary"}
              isDisabled={
                cards.length <= 0 || audioInFlight > 0 || makeCardsLoading
              }
              title={
                audioInFlight > 0
                  ? "Waiting for audio generation to finish"
                  : makeCardsLoading
                    ? "Waiting for card generation to finish"
                    : undefined
              }
              onClick={handleAddCardsToAnki}
            >
              {audioInFlight > 0 || makeCardsLoading ? (
                <>
                  <Spinner size={"xs"} me={1.5} />
                  Working…
                </>
              ) : (
                <>
                  <CheckIcon me={1.5} />
                  Add to Anki
                </>
              )}
            </Button>
            <Button
              size={"xs"}
              onClick={() => {
                setShowClearCardsAlert(true);
              }}
            >
              <DeleteIcon me={1.5} />
              Clear Cards ({cards.length})
            </Button>
            <Button size={"xs"} onClick={clearAllTags}>
              <RiPriceTag3Line style={{ marginRight: "4px" }} size={13} />
              Clear Tags
            </Button>
            <Button
              size={"xs"}
              onClick={() => {
                setShowCustomPromptModal(true);
              }}
            >
              <SettingsIcon me={1.5} />
              Prompt
            </Button>

            {/* Model / notes popover — absorbs the old gray-info rows */}
            <Popover placement={"bottom-end"}>
              <PopoverTrigger>
                <Button size={"xs"}>
                  <InfoIcon me={1.5} />
                  Details
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                <PopoverArrow />
                <PopoverCloseButton />
                <PopoverBody>
                  <Flex direction={"column"} gap={1}>
                    <Text fontSize={12}>
                      Model: <b>{model}</b> · Temperature: <b>{temperature}</b>{" "}
                      · Language: <b>{language}</b>
                    </Text>
                    <Text fontSize={12} color={"gray"}>
                      Max {isLocalMode() ? "1 GB" : "100 MB"} per document
                      file.
                    </Text>
                    <Text fontSize={12} color={"gray"}>
                      Every image embedded in your document is collected in the
                      Images panel, so you can insert images into cards before
                      adding them to Anki.
                    </Text>
                    {automaticallyAddCards && (
                      <Text fontSize={12} color={"gray"}>
                        Every 100 cards will automatically be added to Anki
                        (change this in Settings)
                      </Text>
                    )}
                    <Text fontSize={12} color={"gray"}>
                      Edit text and tags, or add/remove images on each card
                      before adding them to Anki. Images always appear on the
                      answer side.
                    </Text>
                    <Text fontSize={12} color={"gray"}>
                      Voice clips are generated while you review (per-field
                      button or the Generate audio dropdown), never when you
                      add — and cards can't be added until every queued
                      generation is finished.
                    </Text>
                  </Flex>
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </ToolbarGroup>
        </Flex>

        {/* Progress row — only while a document run is active */}
        {makeCardsLoading && view === "documents" && (
          <Flex align={"center"} gap={3} mt={2}>
            <Progress
              flex={1}
              hasStripe
              isAnimated
              value={makeCardsFromDocProgress}
              size={"sm"}
            />
            <Text fontSize={12} color={"gray"} whiteSpace={"nowrap"}>
              {makeCardsFromDocProgress}% · ETA {formatTime(eta || 0)}
            </Text>
            <Button
              size={"xs"}
              colorScheme={"red"}
              onClick={() => {
                infoToast(
                  "Processing Will Stop",
                  "Your document will stop processing after the current chunk is finished."
                );
                terminateMakingCardsFromDoc.current = true;
              }}
            >
              <DeleteIcon me={1.5} boxSize={3} />
              Stop
            </Button>
          </Flex>
        )}
      </Box>

      {/* ───────────────────────── Body ───────────────────────── */}
      <Flex className="card-body" flex={1} minH={0} direction={"row"}>
        {/* Left: view-specific editor + card previewer (scrolls internally) */}
        <Box
          className="card-previewer"
          flex={1}
          minW={0}
          overflowY={"auto"}
          pl={5}
          pr={10}
          py={3}
        >
          {view === "text" && (
            <Flex direction={"column"} mb={3}>
              <Textarea
                bg={colorMode === "light" ? "white" : "customPurple.800"}
                focusBorderColor={"accent"}
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
              <Text alignSelf={"end"} fontSize={12} color={"gray"} p={0} m={0}>
                {makeCardsText.trim().split(/\s+/).length}/750
              </Text>
            </Flex>
          )}

          {view === "failed" && (
            <Flex direction={"column"} mb={3}>
              {failedCards.map((rawString) => (
                <Text mb={5}>{rawString}</Text>
              ))}
            </Flex>
          )}

          {view === "documents" && documentContext.docName && (
            <Text fontSize={12} color={"gray"} mb={2}>
              Last processed: <b>{documentContext.docName}</b> ·{" "}
              {documentContext.chunksCount} text sections ·{" "}
              {documentContext.imagesCount} images found
            </Text>
          )}

          {/* Card-audio section: the dropdown is the standing policy (new
              cards auto-enqueue audio as they're generated while the engine
              is installed); the button applies it to the cards already in
              the list and becomes a Stop control while clips are
              synthesizing. Visible even with the engine absent — clicking
              generate just opens the setup dialog. */}
          {!(ttsStatus && ttsStatus.status === "unsupported") && (
            <Box
              mb={3}
              px={3}
              py={2}
              maxW={300}
              borderWidth={"1px"}
              borderRadius={"md"}
              borderColor={
                colorMode === "light" ? "rgba(0,0,0,0.1)" : "customPurple.700"
              }
              bg={colorMode === "light" ? "rgba(0,0,0,0.02)" : "customPurple.800"}
            >
              <Heading size={"xs"} color={"gray"} mb={1.5}>
                Audio
              </Heading>
              <Select
                size={"sm"}
                value={ttsCardAudioMode}
                aria-label={"Card audio mode"}
                onChange={(e) => {
                  handleAudioModeChange(e.target.value);
                }}
              >
                <option value={"none"}>Don't generate audio</option>
                <option value={"front"}>Generate audio for front</option>
                <option value={"back"}>Generate audio for back</option>
                <option value={"both"}>Generate audio for front and back</option>
              </Select>
              <Text fontSize={11} color={"gray"} mt={1}>
                Applies automatically to cards as they're created.
              </Text>
              {audioInFlight > 0 ? (
                <>
                  <Button
                    mt={2}
                    size={"sm"}
                    variant={"outline"}
                    colorScheme={"red"}
                    width={"100%"}
                    onClick={cancelAllCardAudio}
                  >
                    <CloseIcon me={1.5} boxSize={2.5} />
                    Stop ({audioInFlight})
                  </Button>
                  <Text fontSize={11} color={"gray"} mt={1}>
                    Stops all queued audio. Individual fields can be cancelled
                    on their card.
                  </Text>
                </>
              ) : (
                <>
                  <Button
                    mt={2}
                    size={"sm"}
                    variant={"outline"}
                    width={"100%"}
                    isDisabled={
                      ttsCardAudioMode === "none" || cards.length === 0
                    }
                    onClick={handleGenerateAudioForAll}
                  >
                    <VscUnmute style={{ marginRight: 5 }} />
                    Apply to all cards
                  </Button>
                  <Text fontSize={11} color={"gray"} mt={1}>
                    Apply to all existing cards.
                  </Text>
                </>
              )}
            </Box>
          )}

          <Heading size={"sm"} mb={2}>
            Review & edit cards ({cards.length})
          </Heading>
          {cards.map((card, i) => (
            <EditableCard
              key={card.uid || i}
              card={card}
              index={i}
              imagesById={imagesById}
              modifyCard={modifyCard}
              onDelete={(index) => {
                // Deleting a card cancels its queued audio so a phantom job
                // never keeps the Add-to-Anki gate down.
                const uid = cards[index] && cards[index].uid;
                if (uid) {
                  cancelCardAudio(uid);
                }
                store.dispatch(deleteCardAtIndex(index));
              }}
              onOpenImagePicker={(index) => {
                setPickerCardIndex(index);
              }}
            />
          ))}
        </Box>

        {/* Right: images side panel (fixed column on wide windows) */}
        {!isDrawerMode && showImagesPanel && (
          <Box
            className="card-images-panel"
            w={270}
            flexShrink={0}
            overflowY={"auto"}
            pl={3}
            pr={10}
            py={3}
            borderLeftWidth={"1px"}
            borderLeftColor={
              colorMode === "light" ? "rgba(0,0,0,0.1)" : "customPurple.700"
            }
            bg={colorMode === "light" ? "rgba(0,0,0,0.02)" : "customPurple.800"}
          >
            <DocumentImageLibrary {...libraryProps} />
          </Box>
        )}
      </Flex>

      {/* Panel toggle: a vertical tab pinned to the screen's right edge so
          it reads as the sidebar's open/close handle, not a page button. */}
      <Button
        className="images-edge-toggle"
        variant={"accent"}
        onClick={toggleImagesPanel}
        aria-label={
          panelOpen ? "Collapse images panel" : "Expand images panel"
        }
        leftIcon={
          panelOpen ? (
            <ChevronRightIcon boxSize={3} />
          ) : (
            <ChevronLeftIcon boxSize={3} />
          )
        }
      >
        Images ({allImages.length})
      </Button>

      {/* Narrow windows: the panel floats as an overlay drawer instead */}
      {isDrawerMode && (
        <Drawer
          isOpen={imagesDrawerOpen}
          onClose={() => setImagesDrawerOpen(false)}
          placement={"end"}
        >
          <DrawerOverlay />
          <DrawerContent maxW={"300px"}>
            <DrawerCloseButton />
            <DrawerHeader fontSize={"md"}>Images found</DrawerHeader>
            <DrawerBody>
              <DocumentImageLibrary {...libraryProps} />
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      )}

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
  );
}
