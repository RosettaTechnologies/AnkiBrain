import { useState } from "react";
import { cloneDeep } from "lodash";
import { useSelector } from "react-redux";
import {
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  Heading,
  IconButton,
  Input,
  Spacer,
  Spinner,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Textarea,
  useColorMode,
  VStack,
} from "@chakra-ui/react";
import { AddIcon, CloseIcon, DeleteIcon } from "@chakra-ui/icons";
import { VscUnmute } from "react-icons/vsc";
import {
  cancelFieldAudio,
  requestFieldAudio,
} from "../../../api/cardAudio";
import { playTtsUrl } from "../../../api/tts/player";
import { infoToast } from "../../../api/toast";
import { occlusionCardCount } from "../../../api/occlusion";
import {
  cancelOcclusionGeneration,
  requestCardOcclusionGeneration,
} from "../../../api/occlusionGeneration";
import { OcclusionOverlay } from "./OcclusionOverlay";

const NO_FIELDS = {};

export function cardSnippet(card) {
  if (card.type === "occlusion") {
    return card.header || "Image occlusion";
  }
  const text =
    card.type === "cloze" ? card.text || "" : card.front || card.text || "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 64 ? flat.slice(0, 64) + "…" : flat || "(empty card)";
}

/*
 * One reviewable, editable card in the Make Cards review list.
 *
 * Editing model: every change goes through modifyCard(index, fn), which the
 * CardMakingScreen uses to update the redux `cards` list (persisted back to
 * python's tempCards setting on a debounce). Images are referenced by their
 * media_tmp ids; the webview previews them via file:// urls from
 * imagesRegistry, and ADD_CARDS resolves the ids to bytes at import time.
 *
 * Audio follows the same id pattern: card.audio maps field ('front'|'back';
 * cloze cards only ever have 'back' — its resolved-sentence clip rides on the
 * answer side) to a media_tmp tts id. Clips are synthesized on demand — the
 * per-field button here, Apply-to-all, or mode auto-enqueue — never inline
 * during "Add to Anki". Synthesis state (spinner / error / cancel marks)
 * lives in the cardAudio redux slice, addressed by this card's uid.
 *
 * Manual image adds are intentionally uncapped — the MAX_IMAGES_PER_CARD
 * limit only governs automatic attachment during generation.
 */
export function EditableCard(props) {
  const { card, index, imagesById, modifyCard, onDelete, onOpenImagePicker, onEditOcclusion } =
    props;
  const { colorMode } = useColorMode();
  const [newTag, setNewTag] = useState("");

  const generating = useSelector(
    (s) => (card.uid && s.cardAudio.generating[card.uid]) || NO_FIELDS
  );
  const errors = useSelector(
    (s) => (card.uid && s.cardAudio.errors[card.uid]) || NO_FIELDS
  );
  const audioById = useSelector((s) => s.audioRegistry.value);

  // AI mask generation state for occlusion cards (per-card spinner/cancel).
  const occlusionGenerating = useSelector(
    (s) => !!card.uid && !!s.occlusionGeneration.generating[card.uid]
  );
  const occlusionError = useSelector(
    (s) => (card.uid && s.occlusionGeneration.errors[card.uid]) || ""
  );

  const setField = (field, value) => {
    modifyCard(index, (c) => {
      const cardCopy = cloneDeep(c);
      cardCopy[field] = value;
      // A spoken clip only matches the text it was synthesized from, so
      // editing invalidates it: the field drops back to "no audio" and can
      // be regenerated (button, Apply-to-all, or mode auto-enqueue).
      const audioField = field === "text" ? "back" : field;
      if (cardCopy.audio && cardCopy.audio[audioField] !== undefined) {
        const audio = { ...cardCopy.audio };
        delete audio[audioField];
        cardCopy.audio = audio;
      }
      return cardCopy;
    });
  };

  const removeImage = (imageId) => {
    modifyCard(index, (c) => {
      const cardCopy = cloneDeep(c);
      cardCopy.images = (cardCopy.images || []).filter((id) => id !== imageId);
      return cardCopy;
    });
  };

  const removeFieldAudio = (field) => {
    modifyCard(index, (c) => {
      const cardCopy = cloneDeep(c);
      if (cardCopy.audio) {
        const audio = { ...cardCopy.audio };
        delete audio[field];
        cardCopy.audio = audio;
      }
      return cardCopy;
    });
  };

  const playFieldAudio = (field) => {
    const id = (card.audio || {})[field];
    const entry = id ? audioById[id] : null;
    if (!entry || !entry.url) {
      infoToast(
        "Audio Unavailable",
        "This clip's file was cleaned up. Remove it and generate again."
      );
      return;
    }
    playTtsUrl(entry.url, cardSnippet(card));
  };

  const handleAddTag = () => {
    const value = newTag.trim();
    if (value === "" || value.includes(" ")) {
      return;
    }
    modifyCard(index, (c) => {
      const cardCopy = cloneDeep(c);
      if (!cardCopy.tags.includes(value)) {
        cardCopy.tags.push(value);
      }
      return cardCopy;
    });
    setNewTag("");
  };

  const cardImages = card.images || [];
  const hasFinalizedAudio = !!(
    (card.audio || {}).front || (card.audio || {}).back
  );
  // Occlusion cards carry a single image id (not the 'images' list) and one
  // or more masks; the preview overlays them on the thumbnail.
  const occlusionImage = card.image ? imagesById[card.image] : null;
  const occlusionMaskCount = (card.occlusions || []).length;

  /*
   * Per-field audio controls, sitting right-aligned in the field's heading.
   * Three states mirror the image pattern: generate (or retry after an
   * error) → spinner + cancel while in flight → play + remove once attached.
   * With the voice engine missing, "generate" just opens the setup dialog;
   * the job is not replayed afterwards — the user clicks again.
   */
  const fieldAudioControl = (field, label) => {
    if (!card.uid) {
      return null;
    }

    if (generating[field]) {
      // Explicit centering on every child: the label is an inline-flex box
      // with collapsed leading, so the spinner and text share one midline
      // regardless of inherited line-height.
      return (
        <Flex alignItems="center" gap={1.5} flexShrink={0}>
          <Spinner size={"sm"} color={"accent"} thickness="2px" alignSelf="center" flexShrink={0} />
          <Text
            fontSize={11}
            color={"gray"}
            lineHeight={1}
            display={"inline-flex"}
            alignItems="center"
            alignSelf="center"
          >
            {label} audio
          </Text>
          <Button
            size={"xs"}
            variant={"ghost"}
            colorScheme={"red"}
            onClick={() => cancelFieldAudio(card.uid, field)}
          >
            Cancel
          </Button>
        </Flex>
      );
    }

    const audioId = (card.audio || {})[field];
    if (audioId) {
      const entry = audioById[audioId];
      return (
        <Flex align={"center"}>
          {entry && entry.url ? (
            <IconButton
              aria-label={`Play ${label} audio`}
              icon={<VscUnmute />}
              size={"xs"}
              variant={"ghost"}
              onClick={() => playFieldAudio(field)}
            />
          ) : (
            <Text fontSize={10} color={"gray"} me={1}>
              audio unavailable
            </Text>
          )}
          <IconButton
            aria-label={`Remove ${label} audio`}
            icon={<CloseIcon boxSize={2.5} />}
            size={"xs"}
            colorScheme={"red"}
            variant={"ghost"}
            onClick={() => removeFieldAudio(field)}
          />
        </Flex>
      );
    }

    const error = errors[field];
    return (
      <Button
        size={"xs"}
        variant={"ghost"}
        colorScheme={error ? "orange" : "gray"}
        title={error || undefined}
        onClick={() => requestFieldAudio(card, field)}
      >
        <VscUnmute style={{ marginRight: 4 }} />
        {error ? "Retry audio" : "Add audio"}
      </Button>
    );
  };

  return (
    <Card
      mb={3}
      backgroundColor={colorMode === "light" ? "offWhite" : "customPurple.800"}
      color={colorMode === "light" ? "customBlack" : "white"}
    >
      <CardBody>
        <Flex direction={"row"} align={"start"}>
          <VStack flex={1} align={"stretch"} spacing={3} me={3}>
            <Flex direction={"row"} align={"center"}>
              <Tag me={3}>
                {index + 1} · {card.type}
              </Tag>

              {/* Card-level audio indicator: a plain "audio" label once the
                  card has at least one finalized clip. In-flight jobs show
                  only their per-field spinner (with that field's Cancel) —
                  no second cancel affordance here. */}
              {hasFinalizedAudio && (
                <Tag size={"sm"} me={2} colorScheme={"teal"}>
                  <VscUnmute style={{ marginRight: 4 }} />
                  <TagLabel>audio</TagLabel>
                </Tag>
              )}

              <Spacer />
              <Button
                size={"sm"}
                colorScheme={"red"}
                variant={"ghost"}
                onClick={() => onDelete(index)}
              >
                <DeleteIcon me={2} boxSize={3} />
                Delete
              </Button>
            </Flex>

            {card.type === "occlusion" ? (
              <VStack align={"stretch"} spacing={3}>
                <Flex direction={"row"} align={"center"}>
                  <Heading size={"xs"} color={"gray"}>
                    Image occlusion
                  </Heading>
                  <Spacer />
                  {occlusionGenerating ? (
                    // In-flight AI masks: spinner + per-card Cancel, mirroring
                    // the audio field controls. Editing is locked until the
                    // result lands so a save can't race the generated shapes.
                    <Flex alignItems="center" gap={1.5} flexShrink={0}>
                      <Spinner
                        size={"sm"}
                        color={"accent"}
                        thickness="2px"
                        alignSelf="center"
                        flexShrink={0}
                      />
                      <Text
                        fontSize={11}
                        color={"gray"}
                        lineHeight={1}
                        display={"inline-flex"}
                        alignItems={"center"}
                        alignSelf={"center"}
                      >
                        Generating masks…
                      </Text>
                      <Button
                        size={"xs"}
                        variant={"ghost"}
                        colorScheme={"red"}
                        onClick={() => cancelOcclusionGeneration(card.uid)}
                      >
                        Cancel
                      </Button>
                    </Flex>
                  ) : (
                    <>
                      {occlusionError && (
                        <Button
                          size={"xs"}
                          variant={"ghost"}
                          colorScheme={"orange"}
                          title={occlusionError}
                          onClick={() => requestCardOcclusionGeneration(card)}
                        >
                          Retry masks
                        </Button>
                      )}
                      {occlusionMaskCount === 0 && !occlusionError && (
                        <Button
                          size={"xs"}
                          variant={"outline"}
                          onClick={() => requestCardOcclusionGeneration(card)}
                        >
                          <AddIcon me={1.5} boxSize={2.5} />
                          Generate masks
                        </Button>
                      )}
                      <Button
                        size={"xs"}
                        variant={"outline"}
                        ms={occlusionError || occlusionMaskCount === 0 ? 1.5 : 0}
                        onClick={() => onEditOcclusion(index)}
                      >
                        Edit masks
                      </Button>
                    </>
                  )}
                </Flex>

                <Box
                  position={"relative"}
                  display={"inline-block"}
                  maxW={"100%"}
                  alignSelf={"flex-start"}
                  borderWidth={"1px"}
                  borderRadius={"md"}
                  overflow={"hidden"}
                  bg={colorMode === "light" ? "white" : "customPurple.700"}
                >
                  {occlusionImage ? (
                    <>
                      <img
                        src={occlusionImage.url}
                        alt={card.image}
                        style={{
                          display: "block",
                          maxWidth: "100%",
                          maxHeight: 220,
                          opacity: occlusionGenerating ? 0.45 : 1,
                        }}
                      />
                      <OcclusionOverlay
                        shapes={card.occlusions || []}
                        showOrdinals
                      />
                      {occlusionGenerating && (
                        <Flex
                          position={"absolute"}
                          inset={0}
                          align={"center"}
                          justify={"center"}
                          bg={"blackAlpha.300"}
                        >
                          <Spinner
                            size={"md"}
                            color={"accent"}
                            thickness="3px"
                          />
                        </Flex>
                      )}
                    </>
                  ) : (
                    <Text fontSize={11} color={"gray"} p={3}>
                      Image unavailable — re-import it and edit the card.
                    </Text>
                  )}
                </Box>

                {occlusionGenerating ? (
                  <Text fontSize={11} color={"gray"}>
                    Analyzing this image with AI — the masks will appear here
                    when ready.
                  </Text>
                ) : (
                  <Text fontSize={11} color={"gray"}>
                    {occlusionMaskCount} mask
                    {occlusionMaskCount === 1 ? "" : "s"} ·{" "}
                    {occlusionCardCount(card)} card
                    {occlusionCardCount(card) === 1 ? "" : "s"} ·{" "}
                    {card.occludeInactive
                      ? "hide all, guess one"
                      : "hide one, guess one"}
                  </Text>
                )}

                {occlusionError && !occlusionGenerating && (
                  <Text fontSize={11} color={"orange.400"} noOfLines={2}>
                    AI mask generation failed: {occlusionError}
                  </Text>
                )}

                {card.header && <Text fontSize={12}>{card.header}</Text>}
                {card.backExtra && (
                  <Text fontSize={11} color={"gray"}>
                    {card.backExtra}
                  </Text>
                )}
              </VStack>
            ) : card.type === "cloze" ? (
              <VStack align={"stretch"} spacing={1}>
                <Flex direction={"row"} align={"center"}>
                  <Heading size={"xs"} color={"gray"}>
                    Cloze text (deletions look like {"{{c1::answer}}"})
                  </Heading>
                  <Spacer />
                  {fieldAudioControl("back", "answer")}
                </Flex>
                <Textarea
                  size={"sm"}
                  value={card.text || ""}
                  onChange={(e) => setField("text", e.target.value)}
                  bg={colorMode === "light" ? "white" : "customPurple.700"}
                  focusBorderColor={"accent"}
                />
              </VStack>
            ) : (
              <>
                <VStack align={"stretch"} spacing={1}>
                  <Flex direction={"row"} align={"center"}>
                    <Heading size={"xs"} color={"gray"}>
                      Front
                    </Heading>
                    <Spacer />
                    {fieldAudioControl("front", "front")}
                  </Flex>
                  <Textarea
                    size={"sm"}
                    value={card.front || ""}
                    onChange={(e) => setField("front", e.target.value)}
                    bg={colorMode === "light" ? "white" : "customPurple.700"}
                    focusBorderColor={"accent"}
                  />
                </VStack>
                <VStack align={"stretch"} spacing={1}>
                  <Flex direction={"row"} align={"center"}>
                    <Heading size={"xs"} color={"gray"}>
                      Back
                    </Heading>
                    <Spacer />
                    {fieldAudioControl("back", "back")}
                  </Flex>
                  <Textarea
                    size={"sm"}
                    value={card.back || ""}
                    onChange={(e) => setField("back", e.target.value)}
                    bg={colorMode === "light" ? "white" : "customPurple.700"}
                    focusBorderColor={"accent"}
                  />
                </VStack>
              </>
            )}

            {card.type !== "occlusion" && (
              <VStack align={"stretch"} spacing={2}>
                <Flex direction={"row"} align={"center"}>
                  <Heading size={"xs"} color={"gray"}>
                    Images (answer side)
                  </Heading>
                <Spacer />
                <Button
                  size={"xs"}
                  variant={"outline"}
                  onClick={() => onOpenImagePicker(index)}
                >
                  <AddIcon me={2} boxSize={2.5} />
                  Add image
                </Button>
              </Flex>

              {cardImages.length > 0 ? (
                <Flex direction={"row"} flexWrap={"wrap"}>
                  {cardImages.map((imageId) => {
                    const image = imagesById[imageId];
                    return (
                      <Box key={imageId} m={1} position={"relative"}>
                        {image ? (
                          <img
                            src={image.url}
                            alt={imageId}
                            style={{
                              maxWidth: 140,
                              maxHeight: 100,
                              display: "block",
                            }}
                          />
                        ) : (
                          <Text fontSize={10} color={"gray"}>
                            image unavailable
                          </Text>
                        )}
                        <IconButton
                          aria-label={"Remove image"}
                          icon={<CloseIcon boxSize={2.5} />}
                          size={"xs"}
                          colorScheme={"red"}
                          position={"absolute"}
                          top={0}
                          right={0}
                          onClick={(e) => {
                            e.preventDefault();
                            removeImage(imageId);
                          }}
                        />
                      </Box>
                    );
                  })}
                </Flex>
              ) : (
                <Text fontSize={11} color={"gray"}>
                  No images on this card yet.
                </Text>
              )}
              </VStack>
            )}

            <Flex direction={"row"} align={"center"} flexWrap={"wrap"}>
              {card.tags.map((tag, tagIndex) => (
                <Tag
                  key={tag + tagIndex}
                  size={"md"}
                  me={2}
                  mb={2}
                  colorScheme={"green"}
                >
                  <TagLabel>{tag}</TagLabel>
                  <TagCloseButton
                    onClick={(e) => {
                      e.preventDefault();
                      modifyCard(index, () => {
                        let cardCopy = cloneDeep(card);
                        cardCopy.tags.splice(tagIndex, 1);
                        return cardCopy;
                      });
                    }}
                  />
                </Tag>
              ))}
              <Input
                size={"sm"}
                width={140}
                placeholder={"Add tag..."}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddTag();
                  }
                }}
              />
              <Button size={"sm"} ml={2} onClick={handleAddTag}>
                Add
              </Button>
            </Flex>
          </VStack>
        </Flex>
      </CardBody>
    </Card>
  );
}
