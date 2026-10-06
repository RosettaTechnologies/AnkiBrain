import "./CardMakingScreen.css";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
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
  Spacer,
  Spinner,
  Text,
  Textarea,
  useBreakpointValue,
  useColorMode,
  useToast,
} from "@chakra-ui/react";
import { pyAddCards } from "../../../api/PythonBridge/senders/pyAddCards";
import { pyClearCardsBackup } from "../../../api/PythonBridge/senders/pyCardBackup";
import { addPerfCards } from "../../../api/devPerfCards";
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
import {
  addCard,
  deleteCardAtIndex,
  setCards,
} from "../../../api/redux/slices/cards";
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
import { pickCardsSource, splitSelectedDocument } from "../../../api/documents";
import { importImagePaths } from "../../../api/occlusion";
import {
  cancelAllOcclusionGeneration,
  cancelOcclusionGeneration,
  createOcclusionCards,
} from "../../../api/occlusionGeneration";
import { countOcclusionGenerating } from "../../../api/redux/slices/occlusionGeneration";
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
import { OcclusionEditorModal } from "./OcclusionEditorModal";

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
  // Make Cards file selection awaiting the document warning: {documents,
  // images} from the combined picker, or null. Images-only selections skip
  // the warning and process immediately.
  const [pendingCardsSource, setPendingCardsSource] = useState(null);
  const cancelRef = useRef();
  const [selectedCardType, setSelectedCardType] = useState("basic");
  const customPromptMakeCards = useSelector(
    (state) => state.customPrompts.value.makeCards
  );
  const toast = useToast();

  // Which editor view is active. Replaces the old Tabs; the segment buttons
  // live in the toolbar so all page actions sit in one wrapping strip.
  // "Send to Make Cards" navigates here with { state: { view: "text" } }, so
  // text sent from Talk / Topic Explanation opens on From Text.
  const location = useLocation();
  const [view, setView] = useState(
    ["documents", "text", "failed"].includes(location.state?.view)
      ? location.state.view
      : "documents"
  );

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

  // Rendering every EditableCard stalls the webview once a document yields
  // hundreds/thousands of cards, so only one page is mounted at a time.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const pageCount = Math.max(1, Math.ceil(cards.length / pageSize));
  const pageStart = Math.min(page, pageCount - 1) * pageSize;
  const visibleCards = cards.slice(pageStart, pageStart + pageSize);

  // Generation appends batches: keep the view on the newest cards. Also
  // clamps the page when cards are deleted or the list is cleared.
  const prevCardCountRef = useRef(cards.length);
  useEffect(() => {
    if (cards.length > prevCardCountRef.current) {
      setPage(Math.ceil(cards.length / pageSize) - 1);
    } else if (page > pageCount - 1) {
      setPage(pageCount - 1);
    }
    prevCardCountRef.current = cards.length;
  }, [cards.length, page, pageCount, pageSize]);

  const model = useSelector((state) => state.appSettings.ai.llmModel);
  const temperature = useSelector((state) => state.appSettings.ai.temperature);
  const terminateMakingCardsFromDoc = useRef(false);
  const language = useSelector((state) => state.language.value);
  const deleteCardsAfterAdding = useSelector(
    (state) => state.deleteCardsAfterAdding.value
  );
  const devMode = useSelector((state) => state.devMode.value);
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

  // In-flight AI mask generation for occlusion cards (Make Cards → Image
  // Occlusion): drives the batch progress row and the Add-to-Anki gate,
  // mirroring card audio.
  const occlusionGenerating = useSelector(
    (state) => state.occlusionGeneration.generating
  );
  const occlusionInFlight = useMemo(
    () => countOcclusionGenerating(occlusionGenerating),
    [occlusionGenerating]
  );
  // Occlusion cards whose masks never arrived (cancelled, failed, or a
  // restart dropped the job). Adding them fails python-side, so they block
  // Add-to-Anki until retried, edited, or deleted.
  const occlusionMissingMasks = useMemo(
    () =>
      cards.filter(
        (card) =>
          card.type === "occlusion" && (card.occlusions || []).length === 0
      ).length,
    [cards]
  );
  const appDidBoot = useSelector((state) => state.appDidBoot.value);

  // The card whose image picker is open (null = closed). Manual image adds
  // are uncapped; the picker lists every image found in any processed
  // document so cards can pull from earlier runs too.
  const [pickerCardIndex, setPickerCardIndex] = useState(null);

  // { done, total } while a chunked Add-to-Anki is running; null otherwise.
  const [addProgress, setAddProgress] = useState(null);

  // Dev-only perf-test card count (see the Perf Test popover in the toolbar).
  const [perfCount, setPerfCount] = useState("5000");

  // Occlusion editor target: {image, cardIndex} while open; cardIndex null
  // means a new card. Saving replaces the card at cardIndex (edit) or
  // appends a new occlusion card (create).
  const [occlusionEditor, setOcclusionEditor] = useState(null);

  const allImages = useMemo(() => Object.values(imagesById), [imagesById]);

  // How many cards each image is currently attached to — powers the library
  // badges and lets the picker show "on N cards". Occlusion cards reference
  // their image through the singular `image` id, so they count too.
  const usageCounts = useMemo(() => {
    const counts = {};
    for (let card of cards) {
      for (let imageId of card.images || []) {
        counts[imageId] = (counts[imageId] || 0) + 1;
      }
      if (card.type === "occlusion" && card.image) {
        counts[card.image] = (counts[card.image] || 0) + 1;
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

  // Persist the review list (manual edits and generation appends alike) so it
  // survives closing and reopening Anki.
  const debouncedSaveTempCards = useRef(
    debounce((cardsCopy) => {
      pyEditSetting("tempCards", cardsCopy);
    }, 700)
  ).current;

  useEffect(() => {
    debouncedSaveTempCards(cards);
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

  // Replace one card without deep-cloning the whole list: only the edited card
  // gets a new object, so memoized EditableCards for every other card keep
  // their identity and skip re-rendering. Reads the live store so the callback
  // identity stays stable across renders (memo-friendly).
  const modifyCard = useCallback(
    (i, fn) => {
      const current = store.getState().cards.value;
      const next = current.slice();
      next[i] = fn(next[i]);
      dispatch(setCards(next));
    },
    [dispatch]
  );

  // Deleting a card cancels its queued audio / mask generation so a phantom
  // job never keeps the Add-to-Anki gate down.
  const handleDeleteCard = useCallback(
    (index) => {
      const uid = store.getState().cards.value[index]?.uid;
      if (uid) {
        cancelCardAudio(uid);
        cancelOcclusionGeneration(uid);
      }
      dispatch(deleteCardAtIndex(index));
    },
    [dispatch]
  );

  const handleOpenImagePicker = useCallback(
    (index) => setPickerCardIndex(index),
    []
  );

  // One image id -> one card. Manual inserts are uncapped and deduped.
  const handleInsertImage = (imageId, cardIndex) => {
    modifyCard(cardIndex, (c) => {
      let cardCopy = cloneDeep(c);
      cardCopy.images = [...new Set([...(cardCopy.images || []), imageId])];
      return cardCopy;
    });
  };

  // Occlusion editor: opened from the Images panel (new card) or from a
  // pending occlusion card (edit its masks/fields). The modal owns its draft
  // state; this only routes the save.
  const handleMakeOcclusion = (image) => {
    setOcclusionEditor({ image, cardIndex: null });
  };

  const handleEditOcclusion = useCallback(
    (index) => {
      const card = store.getState().cards.value[index];
      if (!card) {
        return;
      }
      // A restored card may reference an image whose media_tmp file was
      // cleaned up; the modal then shows "image unavailable" instead of
      // silently editing against nothing.
      const image = imagesById[card.image] || {
        id: card.image,
        url: null,
        mediaType: "image/png",
      };
      setOcclusionEditor({ image, cardIndex: index });
    },
    [imagesById]
  );

  const handleSaveOcclusion = (occlusionCard) => {
    const editor = occlusionEditor;
    setOcclusionEditor(null);
    if (!editor) {
      return;
    }

    if (editor.cardIndex !== null) {
      modifyCard(editor.cardIndex, (card) => ({
        ...card,
        ...occlusionCard,
      }));
      successToast("Occlusion Card Updated", "Your masks and fields were saved.");
    } else {
      dispatch(addCard({ ...occlusionCard, tags: [] }));
      successToast(
        "Occlusion Card Added",
        `${occlusionCard.occlusions.length} mask(s) — review it below, then Add to Anki.`
      );
    }
  };

  const handleClearCards = async () => {
    // Cancel any queued audio / mask generation before the cards (their
    // uids) go away.
    if (audioInFlight > 0) {
      cancelAllCardAudio();
    }
    if (occlusionInFlight > 0) {
      cancelAllOcclusionGeneration();
    }
    dispatch(setCards([]));
    await pyEditSetting("tempCards", []);
    await pyClearCardsBackup();
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
    dispatch(
      setCards(
        cards.map((c) => (c.images && c.images.length ? { ...c, images: [] } : c))
      )
    );
    successToast(
      "Images Cleared",
      "Extracted images were removed from the library."
    );
  };

  const clearAllTags = () => {
    dispatch(
      setCards(cards.map((c) => (c.tags.length === 0 ? c : { ...c, tags: [] })))
    );
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

    dispatch(
      setCards(
        cards.map((c) =>
          c.tags.includes(tag) ? c : { ...c, tags: [...c.tags, tag] }
        )
      )
    );
    setTag("");
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

  /*
   * Make Cards…: one picker for documents and images.
   *   - Image files always become image-occlusion cards (AI masks generated
   *     in the background, cancellable per card).
   *   - Documents keep the historical text-card flow, except with the Image
   *     Occlusion type, where the document's images become occlusion cards
   *     and no text cards are generated.
   */
  const handleMakeCardsClick = async () => {
    if (makeCardsLoading || occlusionInFlight > 0) {
      return;
    }

    let source = null;
    try {
      source = await pickCardsSource();
    } catch (err) {
      errorToast("Error", String((err && err.message) || err));
      return;
    }
    if (!source) {
      return;
    }

    if (source.documents.length > 1) {
      infoToast(
        "Multiple Documents",
        "You have selected multiple documents. Only the first one will be used. This will be changed in a future update!"
      );
    }

    // The warning exists so users strip junk pages before the whole
    // document is read — only relevant when a document is in the selection.
    if (source.documents.length > 0) {
      setPendingCardsSource(source);
    } else {
      await processCardsSource(source);
    }
  };

  const processCardsSource = async (source) => {
    setPendingCardsSource(null);
    if (!source) {
      return;
    }

    const imageFiles = source.images || [];
    const documentDescriptor = (source.documents || [])[0] || null;

    try {
      dispatch(setMakeCardsLoading(true));

      // Import selected image files first so their occlusion cards appear
      // alongside whatever the document produces.
      const importedImages = await importImagePaths(
        imageFiles.map((file) => file.path)
      );

      let splitResult = null;
      if (documentDescriptor) {
        splitResult = await splitSelectedDocument(documentDescriptor, dispatch);
        if (!splitResult) {
          return;
        }
      }

      const docImages = (splitResult && splitResult.images) || [];
      if (splitResult) {
        // Keep extracted images available for previews and for ADD_CARDS,
        // which resolves ids to files in media_tmp.
        dispatch(addImages(docImages));

        // Record what this run found so the tab can show a status line and
        // so the library/picker can sort "images from this document" first.
        dispatch(
          setDocumentContext({
            docName: splitResult.doc
              ? splitResult.doc.file_name_with_extension ||
                splitResult.doc.file_name ||
                ""
              : "",
            runId: docImages.length > 0 ? docImages[0].id.split("/")[0] : "",
            chunksCount: splitResult.chunks.length,
            imagesCount: docImages.length,
          })
        );
      }

      const occlusionMode = selectedCardType === "occlusion";
      const imagesToOcclude = occlusionMode
        ? [...docImages, ...importedImages]
        : importedImages;

      if (imagesToOcclude.length > 0) {
        const contexts = buildImageContexts(
          docImages,
          splitResult ? splitResult.chunks : []
        );
        const created = createOcclusionCards(imagesToOcclude, contexts);
        successToast(
          "Making Occlusion Cards",
          `${created.length} image${created.length === 1 ? "" : "s"} queued — masks are generated automatically. Review them below.`
        );
        if (!occlusionMode) {
          infoToast(
            "Images Added as Occlusion Cards",
            "Image files always become image-occlusion cards. Images found inside a document are attached to the cards made from its text."
          );
        }
      } else if (occlusionMode) {
        infoToast(
          "No Images Found",
          documentDescriptor
            ? "No images were found in this document — nothing to turn into occlusion cards."
            : "No images could be imported."
        );
      }

      if (!occlusionMode && splitResult) {
        await generateTextCardsFromDocument(splitResult);
      }
    } catch (err) {
      errorToast("Error", err.message);
    } finally {
      dispatch(setMakeCardsLoading(false));
    }
  };

  // Chunk text near each document image, passed to the vision model as
  // context (the image's anchorChunk indexes into the split chunks).
  const buildImageContexts = (images, chunks) => {
    const contexts = {};
    if (!chunks || chunks.length === 0) {
      return contexts;
    }
    for (const image of images) {
      const anchor = image.anchorChunk;
      if (typeof anchor !== "number" || !Number.isFinite(anchor)) {
        continue;
      }
      const index = Math.min(Math.max(Math.floor(anchor), 0), chunks.length - 1);
      if (chunks[index]) {
        contexts[image.id] = chunks[index];
      }
    }
    return contexts;
  };

  // Text-card generation for a split document (Basic/Cloze types). Same
  // batching/ETA behavior as before, now decoupled from the picker.
  const generateTextCardsFromDocument = async (splitResult) => {
    try {
      dispatch(setMakeCardsLoading(true));

      const chunks = splitResult.chunks;
      const images = splitResult.images || [];

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

  // Dev-only: fabricate dense gibberish cards to measure list performance.
  const handleGeneratePerfCards = () => {
    const n = Math.floor(Number(perfCount));
    if (!Number.isFinite(n) || n < 1) {
      errorToast("Invalid Count", "Enter a whole number of cards (1-50000).");
      return;
    }
    const added = addPerfCards(Math.min(n, 50000));
    infoToast(
      "Perf Cards Added",
      `${added} dev cards appended. Clear them when done — don't send them to Anki.`,
      6000
    );
  };

  const handleAddCardsToAnki = async () => {
    // Make sure the global tag is applied (shallow copy; unchanged cards keep
    // identity).
    const cardsCopy = cards.map((c) =>
      c.tags.includes(tag) ? c : { ...c, tags: [...c.tags, tag] }
    );
    try {
      await pyAddCards(cardsCopy, deck, deleteCardsAfterAdding, (done, total) =>
        setAddProgress({ done, total })
      );
    } finally {
      setAddProgress(null);
    }
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
    if (selectedCardType === "occlusion") {
      infoToast(
        "Image Occlusion",
        "Image occlusion cards are made from documents and images, not text. Use Make Cards… in From Documents/Images."
      );
      return;
    }
    if (makeCardsText.trim().split(/\s+/).length <= 750) {
      await handleMakeCards(makeCardsText, customPromptMakeCards, selectedCardType);
    } else {
      errorToast("Too many tokens");
    }
  };

  // Why Add-to-Anki is unavailable right now (undefined = available). A
  // card with no masks can't be added (python rejects the whole batch), so
  // failed/cancelled mask generation blocks the button until resolved.
  const addBlockedReason =
    audioInFlight > 0
      ? "Waiting for audio generation to finish"
      : makeCardsLoading
        ? "Waiting for card generation to finish"
        : occlusionInFlight > 0
          ? "Waiting for mask generation to finish"
          : occlusionMissingMasks > 0
            ? `${occlusionMissingMasks} occlusion card${
                occlusionMissingMasks === 1 ? " has" : "s have"
              } no masks — retry, edit, or delete ${
                occlusionMissingMasks === 1 ? "it" : "them"
              } first`
            : undefined;

  const libraryProps = {
    images: sortedImages,
    usageCounts,
    cards,
    onInsert: handleInsertImage,
    onClearAll: () => setShowClearImagesAlert(true),
    onMakeOcclusion: handleMakeOcclusion,
    compact: true,
  };

  const segmentPill = (key, label) => (
    <Button
      size={"sm"}
      variant={view === key ? "pillActive" : "ghost"}
      fontWeight={view === key ? "bold" : "normal"}
      color={view === key ? "white" : "gray"}
      boxShadow={view === key ? "0 0 0 2px rgba(115,78,151,0.35)" : "none"}
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
        isOpen={pendingCardsSource !== null}
        onClose={() => {
          setPendingCardsSource(null);
        }}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader>
              <Text>Make Cards</Text>
              <AlertDialogCloseButton />
            </AlertDialogHeader>
            <AlertDialogBody>
              <Text>
                AnkiBrain can make cards out of an entire document up to{" "}
                {isLocalMode() ? "1 GB" : "100 MB"} in size, and turn image
                files into image-occlusion cards.
              </Text>
              <Text>
                AnkiBrain will read <b>every single word</b> in your document,
                including author names, table of contents, indices, etc.
              </Text>
              <Text fontSize={24}>
                To reduce junk cards, <b>you must remove irrelevant pages</b>{" "}
                from your document!
              </Text>
              <Text fontSize={12} color={"gray"}>
                Images found in the document are turned into image-occlusion
                cards when the Image Occlusion type is selected; otherwise
                they are attached to the cards made from the text.
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button
                me={5}
                ref={cancelRef}
                onClick={() => {
                  setPendingCardsSource(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={"accent"}
                onClick={async () => {
                  await processCardsSource(pendingCardsSource);
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
          {segmentPill("documents", "From Documents/Images")}
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
                <Flex direction={"column"} align={"flex-start"}>
                  <Button
                    size={"sm"}
                    variant={"accent"}
                    isDisabled={makeCardsLoading || occlusionInFlight > 0}
                    onClick={handleMakeCardsClick}
                  >
                    {makeCardsLoading || occlusionInFlight > 0 ? (
                      <>
                        <Spinner size={"sm"} me={2} />
                        Generating…
                      </>
                    ) : (
                      <>
                        <AddIcon me={2} />
                        Make Cards...
                      </>
                    )}
                  </Button>
                  {!(makeCardsLoading || occlusionInFlight > 0) && (
                    <Text
                      fontSize={10}
                      color={"gray"}
                      whiteSpace={"nowrap"}
                      mt={0.5}
                    >
                      Select documents or images.
                    </Text>
                  )}
                </Flex>
              ) : (
                <Button
                  size={"sm"}
                  variant={"accent"}
                  isDisabled={
                    makeCardsText === "" ||
                    makeCardsLoading ||
                    occlusionInFlight > 0 ||
                    selectedCardType === "occlusion"
                  }
                  title={
                    selectedCardType === "occlusion"
                      ? "Image occlusion cards are made from documents and images — use Make Cards… in From Documents/Images"
                      : undefined
                  }
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
                  width={140}
                  value={selectedCardType}
                  onChange={(e) => {
                    setSelectedCardType(e.target.value);
                  }}
                >
                  <option value={"basic"}>Basic</option>
                  <option value={"cloze"}>Cloze</option>
                  <option value={"occlusion"}>Image Occlusion</option>
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
                cards.length <= 0 || !!addBlockedReason || addProgress !== null
              }
              title={addBlockedReason}
              onClick={handleAddCardsToAnki}
            >
              {addProgress ? (
                <>
                  <Spinner size={"xs"} me={1.5} />
                  Adding {addProgress.done}/{addProgress.total}
                </>
              ) : audioInFlight > 0 || makeCardsLoading || occlusionInFlight > 0 ? (
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
                    <Text fontSize={12} color={"gray"}>
                      With the Image Occlusion type, Make Cards… turns image
                      files (or the images inside a document) into
                      image-occlusion cards and proposes the masks with AI.
                    </Text>
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
            {devMode && (
              <Popover placement={"bottom-end"}>
                <PopoverTrigger>
                  <Button size={"xs"} variant={"outline"}>
                    Perf Test
                  </Button>
                </PopoverTrigger>
                <PopoverContent width={"260px"}>
                  <PopoverArrow />
                  <PopoverCloseButton />
                  <PopoverBody>
                    <Text fontSize={12} color={"gray"} mb={2}>
                      Dev-only: appends dense gibberish cards (text, images,
                      audio) with no AI, TTS, network, or python. Clear them
                      after testing — do not Add to Anki.
                    </Text>
                    <Input
                      size={"sm"}
                      type={"number"}
                      min={1}
                      max={50000}
                      value={perfCount}
                      onChange={(e) => setPerfCount(e.target.value)}
                    />
                    <Button
                      size={"sm"}
                      mt={2}
                      width={"100%"}
                      onClick={handleGeneratePerfCards}
                    >
                      Generate
                    </Button>
                  </PopoverBody>
                </PopoverContent>
              </Popover>
            )}
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

        {/* Mask generation row — individual cards can be cancelled below */}
        {occlusionInFlight > 0 && (
          <Flex align={"center"} gap={3} mt={2}>
            <Spinner size={"sm"} color={"accent"} />
            <Text fontSize={12} color={"gray"} whiteSpace={"nowrap"}>
              Generating masks for {occlusionInFlight} image
              {occlusionInFlight === 1 ? "" : "s"}…
            </Text>
            <Button
              size={"xs"}
              colorScheme={"red"}
              onClick={cancelAllOcclusionGeneration}
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

          <Flex align="center" gap={2} mb={2} flexWrap="wrap">
            <Heading size={"sm"}>Review & edit cards ({cards.length})</Heading>
            <Spacer />
            {pageCount > 1 && (
              <>
                <Button size="xs" onClick={() => setPage(0)} isDisabled={page === 0}>
                  First
                </Button>
                <Button
                  size="xs"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  isDisabled={page === 0}
                >
                  Prev
                </Button>
                <Text fontSize={12} color="gray" whiteSpace="nowrap">
                  Page {page + 1} of {pageCount}
                </Text>
                <Button
                  size="xs"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  isDisabled={page >= pageCount - 1}
                >
                  Next
                </Button>
                <Button
                  size="xs"
                  onClick={() => setPage(pageCount - 1)}
                  isDisabled={page >= pageCount - 1}
                >
                  Last
                </Button>
                <Select
                  size="xs"
                  width={95}
                  value={pageSize}
                  aria-label="Cards per page"
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </Select>
              </>
            )}
          </Flex>
          {visibleCards.map((card, i) => {
            const globalIndex = pageStart + i;
            return (
              <EditableCard
                key={card.uid || globalIndex}
                card={card}
                index={globalIndex}
                imagesById={imagesById}
                modifyCard={modifyCard}
                onDelete={handleDeleteCard}
                onOpenImagePicker={handleOpenImagePicker}
                onEditOcclusion={handleEditOcclusion}
              />
            );
          })}
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

      <OcclusionEditorModal
        isOpen={occlusionEditor !== null}
        image={occlusionEditor ? occlusionEditor.image : null}
        initialCard={
          occlusionEditor && occlusionEditor.cardIndex !== null
            ? cards[occlusionEditor.cardIndex] || null
            : null
        }
        onClose={() => {
          setOcclusionEditor(null);
        }}
        onSave={handleSaveOcclusion}
      />
    </div>
  );
}
