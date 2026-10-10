import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Heading,
  Input,
  Spacer,
  Text,
  Textarea,
  useColorMode,
} from "@chakra-ui/react";
import { DeleteIcon } from "@chakra-ui/icons";
import { useDispatch, useSelector } from "react-redux";
import {
  invertEntriesIncluded,
  setAllEntriesIncluded,
  setEntryIncluded,
  updateEntryText,
} from "../../../api/redux/slices/stagedDocument";
import { countGeneratableImages } from "../../../api/documentStaging";

const wordCount = (text) =>
  (text || "").trim().split(/\s+/).filter(Boolean).length;

/*
 * Review panel for a document loaded on the From Documents/Images tab.
 *
 * The split result is staged (stagedDocument slice) instead of being sent
 * straight to the LLM: this lists every page (or section, for formats without
 * pages) so the user can exclude junk and edit text before clicking Make
 * Cards. Rows are pure redux state — the panel owns only search/expand.
 */
export function DocumentStagingPanel(props) {
  const {
    busy = false,
    cardType = "basic",
    imagesById = {},
    onGenerate,
    onClear,
  } = props;
  const dispatch = useDispatch();
  const { colorMode } = useColorMode();
  const staged = useSelector((state) => state.stagedDocument.value);

  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState({});

  const entries = staged.entries || [];
  const stagedImages = staged.images || [];
  const looseImageIds = staged.looseImageIds || [];

  const imagesByEntry = useMemo(() => {
    const map = {};
    for (const image of stagedImages) {
      if (!image.anchorEntryId) {
        continue;
      }
      (map[image.anchorEntryId] = map[image.anchorEntryId] || []).push(image);
    }
    return map;
  }, [stagedImages]);

  if (entries.length === 0 && stagedImages.length === 0 && looseImageIds.length === 0) {
    return null;
  }

  const includedEntries = entries.filter((entry) => entry.included);
  const includedWords = includedEntries.reduce(
    (total, entry) => total + wordCount(entry.text),
    0
  );
  const hasPages = entries.some((entry) => entry.pageNumber !== null);
  const noun = hasPages ? "page" : "section";
  const plural = (n) => `${n} ${noun}${n === 1 ? "" : "s"}`;

  const generatableImages = countGeneratableImages(staged, imagesById);
  const canGenerate =
    includedEntries.length > 0 ||
    (cardType === "occlusion" && generatableImages > 0);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = normalizedQuery
    ? entries.filter((entry) =>
        (entry.text || "").toLowerCase().includes(normalizedQuery)
      )
    : entries;

  const surface = colorMode === "light" ? "white" : "customPurple.800";
  const border =
    colorMode === "light" ? "rgba(0,0,0,0.1)" : "customPurple.700";

  return (
    <Box
      className="staged-document-panel"
      borderWidth={"1px"}
      borderColor={border}
      borderRadius={"md"}
      bg={colorMode === "light" ? "rgba(0,0,0,0.02)" : "customPurple.800"}
      px={3}
      py={2.5}
      mb={3}
    >
      <Flex align={"center"} gap={2} wrap={"wrap"}>
        <Heading size={"sm"}>Document pages</Heading>
        <Text fontSize={12} color={"gray"} noOfLines={1} maxW={220}>
          {staged.docName}
        </Text>
        <Text fontSize={12} color={"gray"} whiteSpace={"nowrap"}>
          {plural(entries.length)} · {includedEntries.length} included ·{" "}
          {includedWords} words
        </Text>
        <Spacer />
        <Button
          size={"xs"}
          onClick={() => dispatch(setAllEntriesIncluded(true))}
        >
          All
        </Button>
        <Button
          size={"xs"}
          onClick={() => dispatch(setAllEntriesIncluded(false))}
        >
          None
        </Button>
        <Button size={"xs"} onClick={() => dispatch(invertEntriesIncluded())}>
          Invert
        </Button>
        <Button size={"xs"} variant={"outline"} onClick={onClear}>
          <DeleteIcon me={1.5} boxSize={2.5} />
          Clear
        </Button>
        <Button
          size={"sm"}
          variant={"accent"}
          isDisabled={busy || !canGenerate}
          onClick={onGenerate}
        >
          Make Cards ({includedEntries.length})
        </Button>
      </Flex>

      <Text fontSize={11} color={"gray"} mt={1}>
        AnkiBrain reads every word of included pages. Exclude pages you don't
        want cards from.
      </Text>

      {entries.length === 0 && (
        <Text fontSize={12} color={"gray"} mt={2}>
          No extractable text was found in this document.
          {cardType === "occlusion"
            ? " Its images can still become occlusion cards."
            : " Switch the Type to Image Occlusion to use its images."}
        </Text>
      )}

      {entries.length > 0 && (
        <>
          <Flex align={"center"} gap={2} mt={2}>
            <Input
              size={"xs"}
              maxW={260}
              placeholder={"Find text…"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {normalizedQuery && (
              <Text fontSize={11} color={"gray"}>
                {visibleEntries.length} matching
              </Text>
            )}
          </Flex>

          <Box maxH={"42vh"} overflowY={"auto"} mt={1}>
            {visibleEntries.map((entry) => {
              const entryImages = imagesByEntry[entry.id] || [];
              const isExpanded = !!expandedIds[entry.id];
              return (
                <Flex
                  key={entry.id}
                  className="staged-entry"
                  align={"flex-start"}
                  gap={2}
                  py={1.5}
                  opacity={entry.included ? 1 : 0.45}
                >
                  <Checkbox
                    mt={0.5}
                    isChecked={entry.included}
                    onChange={(event) =>
                      dispatch(
                        setEntryIncluded({
                          id: entry.id,
                          included: event.target.checked,
                        })
                      )
                    }
                    aria-label={`Include ${entry.label}`}
                  />
                  <Box flex={1} minW={0}>
                    <Flex align={"center"} gap={2}>
                      <Badge variant={"subtle"}>{entry.label}</Badge>
                      <Text fontSize={11} color={"gray"}>
                        {wordCount(entry.text)} words
                      </Text>
                    </Flex>
                    {isExpanded ? (
                      <Textarea
                        mt={1}
                        size={"sm"}
                        bg={surface}
                        focusBorderColor={"accent"}
                        value={entry.text}
                        onChange={(event) =>
                          dispatch(
                            updateEntryText({
                              id: entry.id,
                              text: event.target.value,
                            })
                          )
                        }
                      />
                    ) : (
                      <Text
                        mt={0.5}
                        fontSize={12}
                        color={"gray"}
                        noOfLines={2}
                        whiteSpace={"pre-wrap"}
                      >
                        {entry.text}
                      </Text>
                    )}
                    {entryImages.length > 0 && (
                      <Flex gap={1.5} mt={1} wrap={"wrap"}>
                        {entryImages.map((image) => (
                          <Box
                            key={image.id}
                            borderWidth={"1px"}
                            borderColor={border}
                            borderRadius={"sm"}
                            p={0.5}
                            bg={surface}
                          >
                            <img
                              src={image.url}
                              alt={image.id}
                              title={image.id}
                              style={{
                                height: 48,
                                maxWidth: 84,
                                objectFit: "contain",
                                display: "block",
                              }}
                            />
                          </Box>
                        ))}
                      </Flex>
                    )}
                  </Box>
                  <Button
                    size={"xs"}
                    variant={"ghost"}
                    onClick={() =>
                      setExpandedIds((prev) => ({
                        ...prev,
                        [entry.id]: !prev[entry.id],
                      }))
                    }
                  >
                    {isExpanded ? "Collapse" : "Edit"}
                  </Button>
                </Flex>
              );
            })}
          </Box>
        </>
      )}
    </Box>
  );
}
