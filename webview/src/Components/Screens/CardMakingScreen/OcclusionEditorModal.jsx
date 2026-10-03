import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Switch,
  Text,
  Textarea,
  useColorMode,
  useToast,
} from "@chakra-ui/react";
import { DeleteIcon, SmallAddIcon } from "@chakra-ui/icons";
import { suggestOcclusions } from "../../../api/occlusion";
import { OcclusionOverlay } from "./OcclusionOverlay";

/*
 * Image-occlusion editor.
 *
 * Draws masks directly on an image (normalized 0..1 coordinates, the format
 * Anki's built-in Image Occlusion notetype stores), optionally seeded by AI
 * suggestions from a vision model. One mask = one card by default; masks can
 * share an ordinal to hide several regions on the same card. Saving hands
 * the parent a {type: "occlusion", ...} card; the native note is created by
 * cards.py when the card is added to Anki.
 */

const MIN_SIZE = 0.01;
const HANDLE_REACH = 0.03;

let shapeIdCounter = 0;
const newShapeId = () =>
  `o${Date.now().toString(36)}-${(++shapeIdCounter).toString(36)}`;

const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));

function nextOrdinal(shapes) {
  let max = 0;
  for (const shape of shapes) {
    const ordinal = parseInt(shape.ordinal, 10);
    if (Number.isFinite(ordinal) && ordinal > max) {
      max = ordinal;
    }
  }
  return max + 1;
}

function shapeWidth(shape) {
  return shape.shape === "ellipse" ? 2 * (shape.rx || 0) : shape.width || 0;
}

function shapeHeight(shape) {
  return shape.shape === "ellipse" ? 2 * (shape.ry || 0) : shape.height || 0;
}

function hitTest(shapes, point) {
  // Topmost (last drawn) first.
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (shape.draft) {
      continue;
    }
    if (shape.shape === "ellipse") {
      const rx = shape.rx || 0;
      const ry = shape.ry || 0;
      if (rx <= 0 || ry <= 0) {
        continue;
      }
      const dx = (point.x - (shape.left + rx)) / rx;
      const dy = (point.y - (shape.top + ry)) / ry;
      if (dx * dx + dy * dy <= 1) {
        return shape;
      }
    } else if (
      point.x >= shape.left &&
      point.x <= shape.left + shapeWidth(shape) &&
      point.y >= shape.top &&
      point.y <= shape.top + shapeHeight(shape)
    ) {
      return shape;
    }
  }
  return null;
}

function isNearBottomRight(shape, point) {
  const right = shape.left + shapeWidth(shape);
  const bottom = shape.top + shapeHeight(shape);
  return (
    Math.abs(point.x - right) <= HANDLE_REACH &&
    Math.abs(point.y - bottom) <= HANDLE_REACH
  );
}

function normalizeOcclusion(occlusion) {
  return {
    id: newShapeId(),
    ordinal: parseInt(occlusion.ordinal, 10) || 1,
    shape: occlusion.shape === "ellipse" ? "ellipse" : "rect",
    left: Number(occlusion.left) || 0,
    top: Number(occlusion.top) || 0,
    width: Number(occlusion.width) || 0,
    height: Number(occlusion.height) || 0,
    rx: Number(occlusion.rx) || 0,
    ry: Number(occlusion.ry) || 0,
    label: occlusion.label || "",
  };
}

export function OcclusionEditorModal(props) {
  const { isOpen, onClose, image, initialCard = null, onSave } = props;
  const { colorMode } = useColorMode();
  const toast = useToast();

  // The vision call shares the ChatAI subprocess with card generation; the
  // pipe matches one response per request, so don't allow a manual Suggest
  // while a card-generation batch is in flight.
  const cardGenLoading = useSelector((s) => s.makeCardsText.loading);

  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const draftRef = useRef(null);
  const shapesRef = useRef([]);
  // The parent re-renders (and clones) the card list while the modal is
  // open; only the card present at open time may seed the editor.
  const initialCardRef = useRef(initialCard);
  initialCardRef.current = initialCard;

  const [shapes, setShapes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [tool, setTool] = useState("select");
  const [selectedId, setSelectedId] = useState(null);
  const [header, setHeader] = useState("");
  const [backExtra, setBackExtra] = useState("");
  const [occludeInactive, setOccludeInactive] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Seed/reset whenever the modal opens.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const card = initialCardRef.current;
    setTool("select");
    setSelectedId(null);
    setDraft(null);
    setAiLoading(false);
    if (card) {
      setShapes((card.occlusions || []).map(normalizeOcclusion));
      setHeader(card.header || "");
      setBackExtra(card.backExtra || "");
      setOccludeInactive(!!card.occludeInactive);
    } else {
      setShapes([]);
      setHeader("");
      setBackExtra("");
      setOccludeInactive(false);
    }
  }, [isOpen]);

  const cardCount = useMemo(() => {
    const ordinals = new Set();
    for (const shape of shapes) {
      ordinals.add(parseInt(shape.ordinal, 10) || 1);
    }
    return ordinals.size;
  }, [shapes]);

  const pointFromEvent = (event) => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }
    const rect = container.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const updateShape = (id, patch) => {
    setShapes((prev) =>
      prev.map((shape) => (shape.id === id ? { ...shape, ...patch } : shape))
    );
  };

  const deleteShape = (id) => {
    setShapes((prev) => prev.filter((shape) => shape.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const handleMouseDown = (event) => {
    if (!image || !image.url) {
      return;
    }
    const point = pointFromEvent(event);
    if (!point) {
      return;
    }

    if (tool === "select") {
      const hit = hitTest(shapesRef.current, point);
      if (hit) {
        setSelectedId(hit.id);
        dragRef.current = {
          mode: isNearBottomRight(hit, point) ? "resize" : "move",
          id: hit.id,
          start: point,
          origin: { ...hit },
        };
      } else {
        setSelectedId(null);
      }
      event.preventDefault();
      return;
    }

    dragRef.current = { mode: "draw" };
    const draftShape = {
      id: "draft",
      draft: true,
      shape: tool,
      startX: point.x,
      startY: point.y,
      left: point.x,
      top: point.y,
      width: 0,
      height: 0,
      rx: 0,
      ry: 0,
    };
    draftRef.current = draftShape;
    setDraft(draftShape);
    event.preventDefault();
  };

  // Drag/draw continues on window listeners so the cursor may leave the
  // image while resizing or drawing.
  useEffect(() => {
    const handleMove = (event) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const point = pointFromEvent(event);
      if (!point) {
        return;
      }

      if (drag.mode === "draw") {
        // Compute from the ref (kept in lockstep below) so the mouseup
        // commit can never read a draft that lags the last mousemove.
        const prev = draftRef.current;
        if (!prev) {
          return;
        }
        const left = Math.min(prev.startX, point.x);
        const top = Math.min(prev.startY, point.y);
        const width = Math.abs(point.x - prev.startX);
        const height = Math.abs(point.y - prev.startY);
        const next = {
          ...prev,
          left,
          top,
          width,
          height,
          rx: width / 2,
          ry: height / 2,
        };
        draftRef.current = next;
        setDraft(next);
        return;
      }

      setShapes((prev) =>
        prev.map((shape) => {
          if (shape.id !== drag.id) {
            return shape;
          }
          if (drag.mode === "move") {
            const width = shapeWidth(shape);
            const height = shapeHeight(shape);
            return {
              ...shape,
              left: clamp(drag.origin.left + (point.x - drag.start.x), 0, 1 - width),
              top: clamp(drag.origin.top + (point.y - drag.start.y), 0, 1 - height),
            };
          }

          // resize: the bottom-right corner follows the cursor
          const right = clamp(point.x, drag.origin.left + MIN_SIZE, 1);
          const bottom = clamp(point.y, drag.origin.top + MIN_SIZE, 1);
          const width = right - drag.origin.left;
          const height = bottom - drag.origin.top;
          if (shape.shape === "ellipse") {
            return { ...shape, rx: width / 2, ry: height / 2 };
          }
          return { ...shape, width, height };
        })
      );
    };

    const handleUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.mode !== "draw") {
        return;
      }

      const drawn = draftRef.current;
      draftRef.current = null;
      setDraft(null);
      if (!drawn || drawn.width < MIN_SIZE || drawn.height < MIN_SIZE) {
        return;
      }

      const shape = {
        id: newShapeId(),
        ordinal: nextOrdinal(shapesRef.current),
        shape: drawn.shape,
        left: drawn.left,
        top: drawn.top,
        width: drawn.width,
        height: drawn.height,
        rx: drawn.rx,
        ry: drawn.ry,
        label: "",
      };
      setShapes((prev) => [...prev, shape]);
      setSelectedId(shape.id);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [image]);

  const handleSuggest = async () => {
    if (!image || !image.url || aiLoading) {
      return;
    }
    setAiLoading(true);
    try {
      const result = await suggestOcclusions(image.id);
      if (!result.shapes || result.shapes.length === 0) {
        toast({
          title: "No regions suggested",
          description:
            "The AI did not find labeled structures in this image. Draw masks manually instead.",
          status: "info",
          isClosable: true,
        });
        return;
      }
      setShapes((prev) => {
        let ordinal = nextOrdinal(prev);
        const added = result.shapes.map((region) => ({
          ...region,
          id: newShapeId(),
          ordinal: ordinal++,
          label: region.label || "",
        }));
        return [...prev, ...added];
      });
      setHeader((prev) => prev || result.header);
      setBackExtra((prev) => prev || result.backExtra);
      toast({
        title: "Suggestions added",
        description: `${result.shapes.length} region(s) proposed — review and adjust before saving.`,
        status: "success",
        isClosable: true,
      });
    } catch (err) {
      toast({
        title: "AI suggestion failed",
        description: String((err && err.message) || err).slice(0, 300),
        status: "error",
        isClosable: true,
        duration: 10000,
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = () => {
    if (shapes.length === 0) {
      toast({
        title: "No masks yet",
        description: "Draw at least one mask (or use Suggest with AI) before saving.",
        status: "warning",
        isClosable: true,
      });
      return;
    }

    const occlusions = shapes.map((shape) => {
      const base = {
        ordinal: parseInt(shape.ordinal, 10) || 1,
        shape: shape.shape,
        label: shape.label || "",
      };
      if (shape.shape === "ellipse") {
        return { ...base, left: shape.left, top: shape.top, rx: shape.rx, ry: shape.ry };
      }
      return {
        ...base,
        left: shape.left,
        top: shape.top,
        width: shape.width,
        height: shape.height,
      };
    });

    onSave({
      type: "occlusion",
      image: image.id,
      occlusions,
      occludeInactive,
      header,
      backExtra,
    });
  };

  const toolButton = (key, label) => (
    <Button
      size={"sm"}
      variant={tool === key ? "accent" : "outline"}
      onClick={() => {
        setTool(key);
        setSelectedId(null);
      }}
    >
      {label}
    </Button>
  );

  const hasImage = !!(image && image.url);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={"4xl"}
      closeOnOverlayClick={false}
    >
      <ModalOverlay />
      <ModalContent maxH={"92vh"}>
        <ModalHeader fontSize={"md"}>Image occlusion card</ModalHeader>
        <ModalCloseButton />
        <ModalBody overflowY={"auto"}>
          <Flex wrap={"wrap"} align={"center"} gap={2} mb={3}>
            {toolButton("select", "Select")}
            {toolButton("rect", "Rectangle")}
            {toolButton("ellipse", "Ellipse")}
            <Box flex={1} />
            <Button
              size={"sm"}
              variant={"outline"}
              onClick={handleSuggest}
              isDisabled={!hasImage || aiLoading || cardGenLoading}
              title={
                cardGenLoading
                  ? "Waiting for card generation to finish"
                  : undefined
              }
            >
              {aiLoading ? (
                <>
                  <Spinner size={"xs"} me={2} />
                  Analyzing…
                </>
              ) : (
                <>
                  <SmallAddIcon me={2} />
                  Suggest with AI
                </>
              )}
            </Button>
          </Flex>

          <Flex justify={"center"}>
            <Box
              ref={containerRef}
              position={"relative"}
              display={"inline-block"}
              maxW={"100%"}
              borderWidth={"1px"}
              borderRadius={"md"}
              overflow={"hidden"}
              bg={colorMode === "light" ? "white" : "customPurple.700"}
              cursor={tool === "select" ? "default" : "crosshair"}
              userSelect={"none"}
              onMouseDown={handleMouseDown}
            >
              {hasImage ? (
                <img
                  src={image.url}
                  alt={image.id}
                  draggable={false}
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "46vh",
                  }}
                />
              ) : (
                <Text p={6} fontSize={13} color={"gray"} maxW={420}>
                  Image unavailable — it was cleaned up from temporary
                  storage. Re-import the image to build this card.
                </Text>
              )}
              {hasImage && (
                <OcclusionOverlay
                  shapes={draft ? [...shapes, draft] : shapes}
                  selectedId={selectedId}
                  showOrdinals
                />
              )}
            </Box>
          </Flex>

          <Text fontSize={11} color={"gray"} mt={1.5}>
            {tool === "select"
              ? "Click a mask to select it, drag to move, drag its bottom-right corner to resize."
              : "Click and drag on the image to draw a mask."}
          </Text>

          <Heading size={"xs"} color={"gray"} mt={4} mb={1.5}>
            Masks ({shapes.length}) · {cardCount} card{cardCount === 1 ? "" : "s"}
          </Heading>

          {shapes.map((shape) => (
            <Flex
              key={shape.id}
              align={"center"}
              gap={2}
              py={1}
              px={2}
              mb={1}
              borderRadius={"md"}
              bg={
                shape.id === selectedId
                  ? "rgba(245, 158, 11, 0.15)"
                  : colorMode === "light"
                    ? "rgba(0,0,0,0.03)"
                    : "customPurple.700"
              }
            >
              <Text fontSize={11} color={"gray"} minW={"52px"}>
                {shape.shape}
              </Text>
              <Input
                size={"xs"}
                type={"number"}
                min={1}
                width={"70px"}
                value={shape.ordinal}
                onChange={(e) =>
                  updateShape(shape.id, {
                    ordinal: parseInt(e.target.value, 10) || 1,
                  })
                }
                aria-label={"Card ordinal"}
              />
              <Input
                size={"xs"}
                flex={1}
                placeholder={"Label (optional, goes in Back extra)"}
                value={shape.label || ""}
                onChange={(e) =>
                  updateShape(shape.id, { label: e.target.value })
                }
              />
              <Button
                size={"xs"}
                variant={"ghost"}
                colorScheme={"red"}
                onClick={() => deleteShape(shape.id)}
                aria-label={"Delete mask"}
              >
                <DeleteIcon boxSize={3} />
              </Button>
            </Flex>
          ))}

          {shapes.length > 1 && (
            <Text fontSize={10} color={"gray"}>
              Masks sharing an ordinal are hidden together on one card.
            </Text>
          )}

          <FormControl mt={4}>
            <FormLabel fontSize={"xs"} mb={1}>
              Header (shown above the image)
            </FormLabel>
            <Input
              size={"sm"}
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder={"e.g. Label the structures of the heart"}
            />
          </FormControl>

          <FormControl mt={2}>
            <FormLabel fontSize={"xs"} mb={1}>
              Back extra (shown on the answer side)
            </FormLabel>
            <Textarea
              size={"sm"}
              rows={2}
              value={backExtra}
              onChange={(e) => setBackExtra(e.target.value)}
              placeholder={"Optional notes or the list of labels"}
            />
          </FormControl>

          <Flex align={"center"} mt={2}>
            <Switch
              size={"sm"}
              isChecked={occludeInactive}
              onChange={(e) => setOccludeInactive(e.target.checked)}
            />
            <Text fontSize={12} ml={2}>
              Hide all, guess one — every mask stays hidden and the active one
              is the answer
            </Text>
          </Flex>
        </ModalBody>

        <ModalFooter>
          <Button size={"sm"} variant={"ghost"} me={2} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size={"sm"}
            variant={"accent"}
            onClick={handleSave}
            isDisabled={shapes.length === 0 || !image}
          >
            Save card
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
