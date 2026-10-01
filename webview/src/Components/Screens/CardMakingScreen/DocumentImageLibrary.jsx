import { useMemo, useState } from "react";
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
  Spacer,
  Text,
  useColorMode,
  VStack,
} from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import { cardSnippet } from "./EditableCard";

/*
 * "Images found in your document" panel on the From Documents tab.
 *
 * Shows every image extracted from the processed document (imagesRegistry).
 * Clicking a thumbnail opens a preview where the image can be inserted into
 * one or more cards — the same ids the generation pipeline auto-attaches, so
 * manually placed images flow through ADD_CARDS unchanged.
 */
export function DocumentImageLibrary(props) {
  const { images, usageCounts = {}, cards = [], onInsert } = props;
  const { colorMode } = useColorMode();
  const [showOnlyUnused, setShowOnlyUnused] = useState(false);
  const [previewImageId, setPreviewImageId] = useState(null);

  const visibleImages = useMemo(() => {
    if (!showOnlyUnused) {
      return images;
    }
    return images.filter((image) => (usageCounts[image.id] || 0) === 0);
  }, [images, usageCounts, showOnlyUnused]);

  const unusedCount = useMemo(
    () => images.filter((image) => (usageCounts[image.id] || 0) === 0).length,
    [images, usageCounts]
  );

  const previewImage = previewImageId
    ? images.find((image) => image.id === previewImageId) || null
    : null;

  return (
    <Box>
      <Flex direction={"row"} align={"center"} mb={2}>
        <Heading size={"sm"}>Images found in your document ({images.length})</Heading>
        <Spacer />
        <Button
          size={"xs"}
          variant={showOnlyUnused ? "accent" : "outline"}
          onClick={() => setShowOnlyUnused((v) => !v)}
        >
          {showOnlyUnused ? "Showing unused" : `Show unused only (${unusedCount})`}
        </Button>
      </Flex>

      {images.length === 0 ? (
        <Text fontSize={13} color={"gray"}>
          No images have been found yet. Process a document and AnkiBrain will
          collect every image embedded in it here — you can then insert them
          into cards before adding the cards to Anki.
        </Text>
      ) : visibleImages.length === 0 ? (
        <Text fontSize={13} color={"gray"}>
          Every image from this document is already on at least one card.
        </Text>
      ) : (
        <SimpleGrid columns={{ base: 3, md: 4, lg: 5 }} spacing={3}>
          {visibleImages.map((image) => {
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
                      maxHeight: 110,
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
          <ModalHeader fontSize={"md"}>Insert image into a card</ModalHeader>
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

                {cards.length === 0 ? (
                  <Text fontSize={13} color={"gray"}>
                    No cards yet — generate cards from your document first, then
                    come back to insert this image into them.
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
