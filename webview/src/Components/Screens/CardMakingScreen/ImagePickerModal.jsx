import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useColorMode } from "../../../theme/colorMode";
import { CheckIcon } from "@chakra-ui/icons";

/*
 * Card-centric image picker: a grid of every image found in the user's
 * documents (imagesRegistry), pre-checked for the ones already on this card.
 * Manual adds are uncapped by design — MAX_IMAGES_PER_CARD only limits the
 * automatic attachment that happens during generation.
 *
 * onConfirm receives the card's full new image-id list: images the picker
 * never displayed (e.g. ids purged from media_tmp) are preserved untouched.
 */
export function ImagePickerModal(props) {
  const { isOpen, onClose, images, currentImages = [], usageCounts = {}, onConfirm } =
    props;
  const { colorMode } = useColorMode();
  const [selected, setSelected] = useState([]);

  // Re-seed the checkboxes every time the modal opens on a card.
  useEffect(() => {
    if (isOpen) {
      setSelected([...currentImages]);
    }
  }, [isOpen]);

  const toggle = (id) => {
    setSelected((sel) =>
      sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]
    );
  };

  const handleConfirm = () => {
    const shownIds = new Set(images.map((image) => image.id));
    const kept = currentImages.filter(
      (id) => !shownIds.has(id) || selected.includes(id)
    );
    const added = selected.filter((id) => !currentImages.includes(id));
    onConfirm([...kept, ...added]);
    onClose();
  };

  const newCount = selected.filter((id) => !currentImages.includes(id)).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={"xl"}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader fontSize={"md"}>Add images to this card</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {images.length === 0 ? (
            <Text color={"gray"} fontSize={13}>
              No images found yet. Process a document on the "From Documents"
              tab and AnkiBrain will collect the images inside it.
            </Text>
          ) : (
            <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={3}>
              {images.map((image) => {
                const isSelected = selected.includes(image.id);
                const usedOn = usageCounts[image.id] || 0;
                return (
                  <Box
                    key={image.id}
                    as={"button"}
                    textAlign={"left"}
                    p={1.5}
                    borderWidth={"2px"}
                    borderRadius={"md"}
                    borderColor={isSelected ? "accent" : "transparent"}
                    backgroundColor={
                      colorMode === "light" ? "rgba(0,0,0,0.03)" : "customPurple.700"
                    }
                    onClick={() => toggle(image.id)}
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
                      {isSelected && (
                        <Flex
                          position={"absolute"}
                          top={0}
                          right={0}
                          boxSize={6}
                          bg={"accent"}
                          borderRadius={"full"}
                          justify={"center"}
                          align={"center"}
                        >
                          <CheckIcon color={"white"} boxSize={3.5} />
                        </Flex>
                      )}
                    </Box>
                    <Text fontSize={10} color={"gray"} mt={1}>
                      {image.anchorChunk !== null &&
                      image.anchorChunk !== undefined
                        ? `section ~${image.anchorChunk}`
                        : "unanchored"}{" "}
                      · on {usedOn} card{usedOn === 1 ? "" : "s"}
                    </Text>
                  </Box>
                );
              })}
            </SimpleGrid>
          )}
        </ModalBody>
        <ModalFooter>
          <Button mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button variant={"accent"} onClick={handleConfirm}>
            {newCount > 0 ? `Apply (${newCount} new)` : "Apply"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
