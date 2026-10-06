import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Spinner,
  Text,
  useColorMode,
  VStack,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon } from "@chakra-ui/icons";
import { cardSnippet } from "./EditableCard";
import {
  importImageFromClipboard,
  importImagesFromFiles,
} from "../../../api/occlusion";

/*
 * "Images found in your document" panel.
 *
 * Shows every image extracted from the processed document (imagesRegistry).
 * Clicking a thumbnail opens a preview where the image can be inserted into
 * one or more cards — the same ids the generation pipeline auto-attaches, so
 * manually placed images flow through ADD_CARDS unchanged.
 *
 * compact=true renders it as a narrow side panel: single-column list with
 * larger thumbnails and a sticky header (the panel itself scrolls).
 * "Clear All" empties the library via the parent's onClearAll (which also
 * detaches the images from pending cards).
 */
export function DocumentImageLibrary(props) {
  const {
    images,
    usageCounts = {},
    cards = [],
    onInsert,
    onClearAll,
    onMakeOcclusion,
    compact = false,
  } = props;
  const { colorMode } = useColorMode();
  const [previewImageId, setPreviewImageId] = useState(null);
  const [importing, setImporting] = useState(null);

  const handleImportFiles = async () => {
    setImporting("files");
    try {
      await importImagesFromFiles();
    } finally {
      setImporting(null);
    }
  };

  const handleImportClipboard = async () => {
    setImporting("clipboard");
    try {
      await importImageFromClipboard();
    } finally {
      setImporting(null);
    }
  };

  const previewImage = previewImageId
    ? images.find((image) => image.id === previewImageId) || null
    : null;

  // The sticky header must match the surface it floats over: the fixed
  // column paints customPurple.800 / a light gray wash; the drawer body
  // uses the theme background.
  const headerBg =
    colorMode === "light"
      ? compact
        ? "rgb(249,249,249)"
        : "white"
      : "customPurple.800";

  return (
    <Box>
      <Box
        mb={2}
        position={compact ? "sticky" : "static"}
        top={0}
        zIndex={compact ? 1 : "auto"}
        bg={compact ? headerBg : "transparent"}
        py={compact ? 1.5 : 0}
      >
        <Heading size={"sm"}>
          Images ({images.length})
        </Heading>
        <Flex justify={"end"} mt={1.5} gap={1.5} wrap={"wrap"}>
          <Button
            size={"xs"}
            onClick={handleImportFiles}
            isDisabled={importing !== null}
            title={"Import image files for occlusion cards"}
          >
            {importing === "files" ? (
              <Spinner size={"xs"} me={1.5} />
            ) : (
              <AddIcon me={1.5} boxSize={3} />
            )}
            Import
          </Button>
          <Button
            size={"xs"}
            onClick={handleImportClipboard}
            isDisabled={importing !== null}
            title={"Paste an image from the clipboard"}
          >
            {importing === "clipboard" ? (
              <Spinner size={"xs"} me={1.5} />
            ) : (
              <AddIcon me={1.5} boxSize={3} />
            )}
            Clipboard
          </Button>
          {images.length > 0 && (
            <Button size={"xs"} onClick={onClearAll}>
              <DeleteIcon me={1.5} boxSize={3} />
              Clear All
            </Button>
          )}
        </Flex>
      </Box>

      {images.length === 0 ? (
        <Text fontSize={13} color={"gray"}>
          No images yet. If you process a document, all its images will appear here.
          Or, you can import an image file / paste one from the clipboard.
          Images can be inserted into cards or turned into image-occlusion cards before adding them to Anki.
        </Text>
      ) : (
        <SimpleGrid
          columns={compact ? 1 : { base: 3, md: 4, lg: 5 }}
          spacing={3}
        >
          {images.map((image) => {
            const usedOn = usageCounts[image.id] || 0;
            return (
              <Box
                key={image.id}
                as={"button"}
                textAlign={"left"}
                p={1.5}
                borderWidth={"1px"}
                borderRadius={"md"}
                borderColor={colorMode === "light" ? "rgba(0,0,0,0.1)" : "customPurple.700"}
                backgroundColor={colorMode === "light" ? "white" : "customPurple.700"}
                onClick={() => setPreviewImageId(image.id)}
              >
                <Box position={"relative"}>
                  <img
                    src={image.url}
                    alt={image.id}
                    style={{
                      width: "100%",
                      maxHeight: compact ? 160 : 110,
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                  {usedOn > 0 && (
                    <Badge
                      position={"absolute"}
                      top={0}
                      right={0}
                      colorScheme={"green"}
                      fontSize={9}
                    >
                      {usedOn} card{usedOn === 1 ? "" : "s"}
                    </Badge>
                  )}
                </Box>
                <Text fontSize={9} color={"gray"} mt={1} noOfLines={1}>
                  {image.anchorChunk !== null && image.anchorChunk !== undefined
                    ? `section ~${image.anchorChunk}`
                    : "unanchored"}
                </Text>
              </Box>
            );
          })}
        </SimpleGrid>
      )}

      <Modal
        isOpen={previewImage !== null}
        onClose={() => setPreviewImageId(null)}
        size={"lg"}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize={"md"}>Use this image</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {previewImage && (
              <VStack spacing={3} align={"stretch"}>
                <Box
                  p={2}
                  borderWidth={"1px"}
                  borderRadius={"md"}
                  borderColor={colorMode === "light" ? "rgba(0,0,0,0.1)" : "customPurple.700"}
                  bg={colorMode === "light" ? "white" : "customPurple.700"}
                >
                  <img
                    src={previewImage.url}
                    alt={previewImage.id}
                    style={{ width: "100%", maxHeight: "35vh", objectFit: "contain" }}
                  />
                </Box>

                {onMakeOcclusion && (
                  <Flex align={"center"} gap={2} wrap={"wrap"}>
                    <Button
                      size={"sm"}
                      variant={"accent"}
                      onClick={() => {
                        onMakeOcclusion(previewImage);
                        setPreviewImageId(null);
                      }}
                    >
                      <AddIcon me={2} boxSize={3} />
                      Make occlusion card
                    </Button>
                    <Text fontSize={11} color={"gray"}>
                      Hides parts of this image for study (native Anki image
                      occlusion).
                    </Text>
                  </Flex>
                )}

                {cards.length === 0 ? (
                  <Text fontSize={13} color={"gray"}>
                    If you have generated cards, you can insert this image into them.
                  </Text>
                ) : (
                  <>
                    <Text fontSize={12} color={"gray"}>
                      Pick a card below. You can insert into as many as you
                      like, then close this dialog.
                    </Text>
                    <VStack spacing={1} maxH={260} overflowY={"auto"} align={"stretch"}>
                      {cards.map((card, cardIndex) => {
                        const alreadyOn = (card.images || []).includes(
                          previewImage.id
                        );
                        return (
                          <Flex
                            key={cardIndex}
                            direction={"row"}
                            align={"center"}
                            py={1.5}
                            px={2}
                            borderRadius={"md"}
                            bg={
                              colorMode === "light"
                                ? "rgba(0,0,0,0.03)"
                                : "customPurple.800"
                            }
                          >
                            <Text fontSize={12} noOfLines={1} flex={1}>
                              {cardIndex + 1}. {cardSnippet(card)}
                            </Text>
                            <Button
                              size={"xs"}
                              ml={2}
                              isDisabled={alreadyOn}
                              onClick={() => onInsert(previewImage.id, cardIndex)}
                            >
                              {alreadyOn ? (
                                <Badge colorScheme={"green"}>Inserted</Badge>
                              ) : (
                                <>
                                  <AddIcon me={1.5} boxSize={2.5} />
                                  Insert
                                </>
                              )}
                            </Button>
                          </Flex>
                        );
                      })}
                    </VStack>
                  </>
                )}
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
