import { Box } from "@chakra-ui/react";

/*
 * Read-only normalized-coordinate overlay for image-occlusion shapes.
 *
 * Coordinates are fractions (0..1) of the image size — exactly what Anki's
 * built-in Image Occlusion notetype stores. The SVG uses a 1x1 viewBox with
 * preserveAspectRatio="none" so the same shape math works at any rendered
 * size, and vectorEffect keeps strokes a constant screen width.
 */

export const OCCLUSION_FILL = "rgba(220, 38, 38, 0.35)";
export const OCCLUSION_STROKE = "#dc2626";
export const OCCLUSION_SELECTED_FILL = "rgba(245, 158, 11, 0.4)";
export const OCCLUSION_SELECTED_STROKE = "#f59e0b";
export const OCCLUSION_DRAFT_STROKE = "#3182ce";

export function OcclusionOverlay(props) {
  const {
    shapes = [],
    selectedId = null,
    showOrdinals = false,
    interactive = false,
    ...boxProps
  } = props;

  return (
    <Box
      position="absolute"
      inset={0}
      pointerEvents={interactive ? "auto" : "none"}
      {...boxProps}
    >
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {shapes.map((shape) => {
          const selected = shape.id === selectedId;
          const draft = !!shape.draft;
          const fill = draft
            ? "rgba(49, 130, 206, 0.15)"
            : selected
              ? OCCLUSION_SELECTED_FILL
              : OCCLUSION_FILL;
          const stroke = draft
            ? OCCLUSION_DRAFT_STROKE
            : selected
              ? OCCLUSION_SELECTED_STROKE
              : OCCLUSION_STROKE;

          if (shape.shape === "ellipse") {
            const rx = Math.max(shape.rx || 0, 0.001);
            const ry = Math.max(shape.ry || 0, 0.001);
            return (
              <ellipse
                key={shape.id}
                cx={shape.left + rx}
                cy={shape.top + ry}
                rx={rx}
                ry={ry}
                fill={fill}
                stroke={stroke}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            );
          }

          return (
            <rect
              key={shape.id}
              x={shape.left}
              y={shape.top}
              width={Math.max(shape.width || 0, 0.001)}
              height={Math.max(shape.height || 0, 0.001)}
              fill={fill}
              stroke={stroke}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {showOrdinals &&
        shapes.map((shape) => {
          if (shape.draft) {
            return null;
          }
          const centerX =
            shape.shape === "ellipse"
              ? shape.left + (shape.rx || 0)
              : shape.left + (shape.width || 0) / 2;
          const centerY =
            shape.shape === "ellipse"
              ? shape.top + (shape.ry || 0)
              : shape.top + (shape.height || 0) / 2;
          return (
            <Box
              key={shape.id}
              position="absolute"
              left={`${centerX * 100}%`}
              top={`${centerY * 100}%`}
              transform="translate(-50%, -50%)"
              bg="blackAlpha.700"
              color="white"
              fontSize="10px"
              lineHeight="1"
              px={1.5}
              py={0.5}
              borderRadius="full"
              pointerEvents="none"
            >
              {shape.ordinal}
            </Box>
          );
        })}
    </Box>
  );
}
