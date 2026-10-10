import { store } from "./redux";
import { addCards } from "./redux/slices/cards";
import { addImages } from "./redux/slices/imagesRegistry";
import { addAudioEntries } from "./redux/slices/audioRegistry";

// Pools stay tiny: distinct data-URL media gives real decode/render work
// without any bytes crossing the python bridge.
const IMAGE_POOL_SIZE = 24;
const AUDIO_POOL_SIZE = 12;
const FRONT_CHARS = 700;
const BACK_CHARS = 1100;

// ~2.6 KB of repeated word salad, built once; each card slices a different
// window so text is dense and never identical.
const WORDS =
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure reprehenderit voluptate velit esse cillum".split(
    " "
  );
const LONG_TEXT = Array.from(
  { length: 400 },
  (_, i) => WORDS[i % WORDS.length]
).join(" ");

function denseText(seed, chars) {
  const span = Math.min(chars, LONG_TEXT.length);
  const maxStart = Math.max(1, LONG_TEXT.length - span);
  const start = (seed * 13) % maxStart;
  return `[${seed}] ` + LONG_TEXT.slice(start, start + span);
}

function svgImageUrl(i) {
  const hue = (i * 37) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220">` +
    `<rect width="100%" height="100%" fill="hsl(${hue},70%,55%)"/>` +
    `<text x="12" y="40" font-size="28" fill="#ffffff">img ${i}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Minimal valid 16-bit mono WAV of silence; play buttons just need a truthy
// entry.url, so no real audio payload is needed.
function silentWavUrl(seed) {
  const sampleRate = 8000;
  const samples = 2000 + seed;
  const dataBytes = samples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const write = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:audio/wav;base64," + btoa(binary);
}

function imagePool() {
  return Array.from({ length: IMAGE_POOL_SIZE }, (_, i) => ({
    id: `devimg/${i}.svg`,
    url: svgImageUrl(i),
    mediaType: "image/svg+xml",
  }));
}

function audioPool() {
  return Array.from({ length: AUDIO_POOL_SIZE }, (_, i) => ({
    id: `devaudio/${i}.wav`,
    url: silentWavUrl(i),
    mediaType: "audio/wav",
  }));
}

// Mixed basic/cloze/occlusion cards with dense text, 2 images, and audio on
// every card (occlusion cards carry an image + 2 masks instead).
export function buildPerfCards(count) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    const bucket = i % 10;
    if (bucket === 9) {
      cards.push({
        type: "occlusion",
        image: `devimg/${i % IMAGE_POOL_SIZE}.svg`,
        occlusions: [0, 1].map((k) => ({
          id: `perf-${i}-${k}`,
          shape: "rect",
          ordinal: k + 1,
          left: 0.08 + 0.24 * k,
          top: 0.2,
          width: 0.18,
          height: 0.14,
        })),
        header: denseText(i, 120),
        backExtra: denseText(i + 1, 200),
        occludeInactive: false,
        tags: ["perf"],
      });
      continue;
    }

    const images = [
      `devimg/${i % IMAGE_POOL_SIZE}.svg`,
      `devimg/${(i + 5) % IMAGE_POOL_SIZE}.svg`,
    ];
    const back = `devaudio/${(i + 3) % AUDIO_POOL_SIZE}.wav`;

    if (bucket >= 7) {
      cards.push({
        type: "cloze",
        text:
          `${denseText(i, 400)} {{c1::${WORDS[i % WORDS.length]}}} ` +
          `${denseText(i + 2, 300)} {{c2::${WORDS[(i + 3) % WORDS.length]}}}`,
        images,
        audio: { back },
        tags: ["perf", "cloze"],
      });
      continue;
    }

    cards.push({
      type: "basic",
      front: denseText(i, FRONT_CHARS),
      back: denseText(i + 1, BACK_CHARS),
      images,
      audio: { front: `devaudio/${i % AUDIO_POOL_SIZE}.wav`, back },
      tags: ["perf", "basic"],
    });
  }
  return cards;
}

// Registers the media pools and appends the cards. Returns how many were
// added. Synchronous and dependency-free by design: repeatable in well under
// a second at 10,000 cards.
export function addPerfCards(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) {
    return 0;
  }
  store.dispatch(addImages(imagePool()));
  store.dispatch(addAudioEntries(audioPool()));
  store.dispatch(addCards(buildPerfCards(n)));
  return n;
}
