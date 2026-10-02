import "./CardMakingScreen.css";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useMemo, useRef, useState } from "react";
import { cloneDeep, debounce } from "lodash";
import {
  IonAlert,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonModal,
  IonPopover,
  IonProgressBar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import {
  add,
  checkmark,
  close,
  informationCircleOutline,
  options as optionsIcon,
  pricetagOutline,
  star,
  trash,
  volumeHighOutline,
} from "ionicons/icons";
import { pyAddCards } from "../../../api/PythonBridge/senders/pyAddCards";
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

/*
 * Media query hook replacing Chakra's useBreakpointValue for the one
 * breakpoint this screen needs (lg = 62em = 992px).
 */
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);
    setMatches(mql.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
    } else {
      mql.addListener(handler);
    }
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", handler);
      } else {
        mql.removeListener(handler);
      }
    };
  }, [query]);

  return matches;
}

function ClearCardsAlert(props) {
  return (
    <IonAlert
      isOpen={props.isOpen}
      header="Clear All Cards"
      message={"Are you sure? You can't undo this action. Note: this only clears cards in AnkiBrain, not Anki."}
      buttons={[
        {
          text: "Cancel",
          role: "cancel",
          handler: props.onCancel,
        },
        {
          text: "Clear All",
          role: "destructive",
          handler: props.onOK,
        },
      ]}
      onDidDismiss={props.onCancel}
    />
  );
}

/*
 * Confirmation for the images sidebar's "Clear All" button. Mirrors
 * ClearCardsAlert; notes when images are currently attached to cards, since
 * clearing detaches them too.
 */
function ClearImagesAlert(props) {
  return (
    <IonAlert
      isOpen={props.isOpen}
      header="Clear All Images"
      message={
        "Are you sure? You can't undo this action." +
        (props.usedImageCount > 0
          ? ` Note: this also detaches ${props.usedImageCount} image${
              props.usedImageCount === 1 ? "" : "s"
            } currently inserted on cards.`
          : "") +
        " Note: this only clears images in AnkiBrain, not Anki."
      }
      buttons={[
        {
          text: "Cancel",
          role: "cancel",
          handler: props.onCancel,
        },
        {
          text: "Clear All",
          role: "destructive",
          handler: props.onOK,
        },
      ]}
      onDidDismiss={props.onCancel}
    />
  );
}

/*
 * One non-breaking group of toolbar controls. The toolbar wraps between
 * groups at narrow widths, never inside one.
 */
function ToolbarGroup(props) {
  return (
    <div className="ToolbarGroup" {...props}>
      {props.children}
    </div>
  );
}

export function CardMakingScreen() {
  const dispatch = useDispatch();

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
  const [selectedCardType, setSelectedCardType] = useState("basic");
  const customPromptMakeCards = useSelector(
    (state) => state.customPrompts.value.makeCards
  );

  // Which editor view is active. Replaces the old Tabs; the segment buttons
  // live in the toolbar so all page actions sit in one wrapping strip.
  const [view, setView] = useState("documents");

  // The extracted-images side panel. Expanded by default; on narrow windows
  // it floats as an overlay modal instead of a fixed column. Separate states
  // because the breakpoint resolves to "base" for a frame on mount, and an
  // auto-opened overlay would cover the previewer at startup.
  const [showImagesPanel, setShowImagesPanel] = useState(true);
  const [imagesDrawerOpen, setImagesDrawerOpen] = useState(false);
  const isDrawerMode = !useMediaQuery("(min-width: 992px)");
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
      errorToast("Invalid Tag", "Tags cannot contain spaces.");

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

      <IonModal
        isOpen={showMakeCardsFromDocumentAlert}
        onDidDismiss={() => {
          setShowMakeCardsFromDocumentAlert(false);
        }}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Make Cards From Document</IonTitle>
            <IonButtons slot="end">
              <IonButton
                onClick={() => {
                  setShowMakeCardsFromDocumentAlert(false);
                }}
              >
                Close
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <div className="MakeCardsFromDocAlert">
            <p>
              AnkiBrain can make cards out of an entire document up to{" "}
              {isLocalMode() ? "1 GB" : "100 MB"} in size.
            </p>
            <p>
              AnkiBrain will read <b>every single word</b> in your document,
              including author names, table of contents, indices, etc.
            </p>
            <p className="MakeCardsFromDocAlert-loud">
              To reduce junk cards, <b>you must remove irrelevant pages</b> from
              your document!
            </p>
            <div className="MakeCardsFromDocAlert-actions">
              <IonButton
                fill="clear"
                onClick={() => {
                  setShowMakeCardsFromDocumentAlert(false);
                }}
              >
                Cancel
              </IonButton>
              <IonButton
                color="accent"
                onClick={async () => {
                  setShowMakeCardsFromDocumentAlert(false);
                  await makeCardsFromDocument();
                }}
              >
                I understand, proceed
              </IonButton>
            </div>
          </div>
        </IonContent>
      </IonModal>

      <CustomPromptMakeCardsModal
        isOpen={showCustomPromptModal}
        onClose={() => {
          setShowCustomPromptModal(false);
        }}
      />

      {/* ───────────────────────── Toolbar ───────────────────────── */}
      <div className="card-toolbar">
        {/* Row 1: view navigation — visually separate from the action strip */}
        <div className="card-toolbar-nav">
          <IonSegment
            className="card-view-segment"
            value={view}
            onIonChange={(e) => setView(e.detail.value)}
          >
            <IonSegmentButton value="documents">
              <IonLabel>From Documents</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="text">
              <IonLabel>From Text</IonLabel>
            </IonSegmentButton>
            {failedCards.length > 0 && (
              <IonSegmentButton value="failed">
                <IonLabel>Failed Cards ({failedCards.length})</IonLabel>
              </IonSegmentButton>
            )}
          </IonSegment>
        </div>

        {/* Row 2+: action strip, wraps between groups at narrow widths */}
        <div className="card-toolbar-actions">
          {/* Primary action (context-aware) + card type */}
          {view !== "failed" && (
            <ToolbarGroup>
              {view === "documents" ? (
                <IonButton
                  size="small"
                  color="accent"
                  disabled={makeCardsLoading}
                  onClick={() => {
                    setShowMakeCardsFromDocumentAlert(true);
                  }}
                >
                  {makeCardsLoading ? (
                    <>
                      <IonSpinner name="crescent" slot="start" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <IonIcon slot="start" icon={add} />
                      Make Cards From Document
                    </>
                  )}
                </IonButton>
              ) : (
                <IonButton
                  size="small"
                  color="accent"
                  disabled={makeCardsText === "" || makeCardsLoading}
                  onClick={handleMakeFromTextClick}
                >
                  {makeCardsLoading ? (
                    <>
                      <IonSpinner name="crescent" slot="start" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <IonIcon slot="start" icon={star} />
                      Make Cards From Text
                    </>
                  )}
                </IonButton>
              )}
              <ToolbarGroup>
                <span className="card-toolbar-label">Type</span>
                <IonSelect
                  className="card-type-select"
                  value={selectedCardType}
                  interface="popover"
                  onIonChange={(e) => {
                    setSelectedCardType(e.detail.value);
                  }}
                >
                  <IonSelectOption value={"basic"}>Basic</IonSelectOption>
                  <IonSelectOption value={"cloze"}>Cloze</IonSelectOption>
                </IonSelect>
              </ToolbarGroup>
            </ToolbarGroup>
          )}

          {/* Deck + global tag */}
          <ToolbarGroup>
            <IonInput
              className="card-toolbar-input"
              fill="solid"
              placeholder={"Deck (optional)"}
              value={deck}
              onIonInput={(e) => {
                setDeck(e.detail.value || "");
              }}
            />
            <IonInput
              className="card-toolbar-input card-toolbar-input--tag"
              fill="solid"
              placeholder={"Global tag"}
              value={tag}
              onIonInput={(e) => {
                setTag(e.detail.value || "");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTag();
                }
              }}
            />
            <IonButton
              size="small"
              fill="outline"
              onClick={handleAddTag}
              aria-label={"Apply tag"}
            >
              <IonIcon slot="icon-only" icon={add} />
            </IonButton>
          </ToolbarGroup>

          <div className="card-toolbar-spacer" />

          {/* Secondary actions */}
          <ToolbarGroup>
            {/* Adds are instant (no inline synthesis anymore), but stay
                locked while any card generation or audio job is still in
                flight — half-spoken cards must not sneak into the deck. */}
            <IonButton
              size="small"
              color="secondary"
              disabled={
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
                  <IonSpinner name="crescent" slot="start" />
                  Working…
                </>
              ) : (
                <>
                  <IonIcon slot="start" icon={checkmark} />
                  Add to Anki
                </>
              )}
            </IonButton>
            <IonButton
              size="small"
              color="light"
              onClick={() => {
                setShowClearCardsAlert(true);
              }}
            >
              <IonIcon slot="start" icon={trash} />
              Clear Cards ({cards.length})
            </IonButton>
            <IonButton size="small" color="light" onClick={clearAllTags}>
              <IonIcon slot="start" icon={pricetagOutline} />
              Clear Tags
            </IonButton>
            <IonButton
              size="small"
              color="light"
              onClick={() => {
                setShowCustomPromptModal(true);
              }}
            >
              <IonIcon slot="start" icon={optionsIcon} />
              Prompt
            </IonButton>

            {/* Model / notes popover — absorbs the old gray-info rows */}
            <IonPopover trigger="card-details-trigger" triggerAction="click">
              <div className="card-details-popover">
                <p>
                  Model: <b>{model}</b> · Temperature: <b>{temperature}</b> ·{" "}
                  Language: <b>{language}</b>
                </p>
                <p className="card-details-muted">
                  Max {isLocalMode() ? "1 GB" : "100 MB"} per document file.
                </p>
                <p className="card-details-muted">
                  Every image embedded in your document is collected in the
                  Images panel, so you can insert images into cards before
                  adding them to Anki.
                </p>
                {automaticallyAddCards && (
                  <p className="card-details-muted">
                    Every 100 cards will automatically be added to Anki (change
                    this in Settings)
                  </p>
                )}
                <p className="card-details-muted">
                  Edit text and tags, or add/remove images on each card before
                  adding them to Anki. Images always appear on the answer side.
                </p>
                <p className="card-details-muted">
                  Voice clips are generated while you review (per-field button
                  or the Generate audio dropdown), never when you add — and
                  cards can't be added until every queued generation is
                  finished.
                </p>
              </div>
            </IonPopover>
            <IonButton
              id="card-details-trigger"
              size="small"
              color="light"
            >
              <IonIcon slot="start" icon={informationCircleOutline} />
              Details
            </IonButton>
          </ToolbarGroup>
        </div>

        {/* Progress row — only while a document run is active */}
        {makeCardsLoading && view === "documents" && (
          <div className="card-toolbar-progress">
            <IonProgressBar
              className="card-toolbar-progressBar"
              value={makeCardsFromDocProgress / 100}
            />
            <span className="card-toolbar-progressText">
              {makeCardsFromDocProgress}% · ETA {formatTime(eta || 0)}
            </span>
            <IonButton
              size="small"
              color="danger"
              fill="outline"
              onClick={() => {
                infoToast(
                  "Processing Will Stop",
                  "Your document will stop processing after the current chunk is finished."
                );
                terminateMakingCardsFromDoc.current = true;
              }}
            >
              <IonIcon slot="start" icon={trash} />
              Stop
            </IonButton>
          </div>
        )}
      </div>

      {/* ───────────────────────── Body ───────────────────────── */}
      <div className="card-body">
        {/* Left: view-specific editor + card previewer (scrolls internally) */}
        <div className="card-previewer">
          {view === "text" && (
            <TextEditorView
              makeCardsText={makeCardsText}
              onTextChange={debouncedCardsTextChangeHandler}
            />
          )}

          {view === "failed" && (
            <div className="card-failedView">
              {failedCards.map((rawString, index) => (
                <p key={index}>{rawString}</p>
              ))}
            </div>
          )}

          {view === "documents" && documentContext.docName && (
            <p className="card-lastProcessed">
              Last processed: <b>{documentContext.docName}</b> ·{" "}
              {documentContext.chunksCount} text sections ·{" "}
              {documentContext.imagesCount} images found
            </p>
          )}

          {/* Card-audio section: the dropdown is the standing policy (new
              cards auto-enqueue audio as they're generated while the engine
              is installed); the button applies it to the cards already in
              the list and becomes a Stop control while clips are
              synthesizing. Visible even with the engine absent — clicking
              generate just opens the setup dialog. */}
          {!(ttsStatus && ttsStatus.status === "unsupported") && (
            <div className="card-audioBox">
              <h4 className="card-audioBox-title">Audio</h4>
              <IonSelect
                className="card-audioBox-select"
                value={ttsCardAudioMode}
                interface="popover"
                aria-label={"Card audio mode"}
                onIonChange={(e) => {
                  handleAudioModeChange(e.detail.value);
                }}
              >
                <IonSelectOption value={"none"}>
                  Don't generate audio
                </IonSelectOption>
                <IonSelectOption value={"front"}>
                  Generate audio for front
                </IonSelectOption>
                <IonSelectOption value={"back"}>
                  Generate audio for back
                </IonSelectOption>
                <IonSelectOption value={"both"}>
                  Generate audio for front and back
                </IonSelectOption>
              </IonSelect>
              <p className="card-audioBox-hint">
                Applies automatically to cards as they're created.
              </p>
              {audioInFlight > 0 ? (
                <>
                  <IonButton
                    className="card-audioBox-btn"
                    size="small"
                    fill="outline"
                    color="danger"
                    expand="block"
                    onClick={cancelAllCardAudio}
                  >
                    <IonIcon slot="start" icon={close} />
                    Stop ({audioInFlight})
                  </IonButton>
                  <p className="card-audioBox-hint">
                    Stops all queued audio. Individual fields can be cancelled
                    on their card.
                  </p>
                </>
              ) : (
                <>
                  <IonButton
                    className="card-audioBox-btn"
                    size="small"
                    fill="outline"
                    expand="block"
                    disabled={ttsCardAudioMode === "none" || cards.length === 0}
                    onClick={handleGenerateAudioForAll}
                  >
                    <IonIcon slot="start" icon={volumeHighOutline} />
                    Apply to all cards
                  </IonButton>
                  <p className="card-audioBox-hint">
                    Apply to all existing cards.
                  </p>
                </>
              )}
            </div>
          )}

          <h4 className="card-reviewHeading">
            Review & edit cards ({cards.length})
          </h4>
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
        </div>

        {/* Right: images side panel (fixed column on wide windows) */}
        {!isDrawerMode && showImagesPanel && (
          <div className="card-images-panel">
            <DocumentImageLibrary {...libraryProps} />
          </div>
        )}
      </div>

      {/* Panel toggle: a vertical tab pinned to the screen's right edge so
          it reads as the sidebar's open/close handle, not a page button. */}
      <IonButton
        className="images-edge-toggle"
        color="accent"
        onClick={toggleImagesPanel}
        aria-label={
          panelOpen ? "Collapse images panel" : "Expand images panel"
        }
      >
        Images ({allImages.length})
      </IonButton>

      {/* Narrow windows: the panel floats as an overlay modal instead */}
      {isDrawerMode && (
        <IonModal
          isOpen={imagesDrawerOpen}
          onDidDismiss={() => setImagesDrawerOpen(false)}
        >
          <IonHeader>
            <IonToolbar>
              <IonTitle>Images found</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setImagesDrawerOpen(false)}>
                  Close
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <DocumentImageLibrary {...libraryProps} />
          </IonContent>
        </IonModal>
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

/*
 * "From Text" editor. The draft is local so the debounced redux write can't
 * snap the textarea back to a stale value mid-typing; it re-seeds from the
 * store whenever the view remounts.
 */
function TextEditorView({ makeCardsText, onTextChange }) {
  const [draft, setDraft] = useState(makeCardsText);
  const wordCount = draft.trim().split(/\s+/).length;

  return (
    <div className="card-textView">
      <IonTextarea
        className="card-textView-input"
        fill="solid"
        autoGrow={true}
        value={draft}
        onIonInput={(event) => {
          const text = event.detail.value || "";
          setDraft(text);
          const currentWordCount = text.trim().split(/\s+/).length;
          if (currentWordCount < 750) {
            onTextChange(text);
          }
        }}
        placeholder={
          "You can generate in Topic Explanation or copy-paste any information into here..."
        }
      />
      <span className="card-textView-counter">{wordCount}/750</span>
    </div>
  );
}
