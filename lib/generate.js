import sharp from "sharp";
import satori from "satori";
import fs from "fs/promises";
import path from "path";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const BASE_IMAGE_PATH = path.join(process.cwd(), "lib", "assets", "base.jpg");
// Fallback font bundled in the repo, used only if the Impact-style font
// below can't be fetched (e.g. no outbound network at build/runtime).
const FALLBACK_FONT_PATH = path.join(process.cwd(), "lib", "fonts", "BigShoulders-Bold.ttf");

// Impact itself is a proprietary Monotype font and can't legally be bundled
// or redistributed in this repo. "Anton" is the closest free, OFL-licensed
// look-alike (tall, ultra-bold, condensed grotesque) and is what's actually
// used for classic-meme-style captions here. It's fetched once from the
// Fontsource/jsDelivr CDN and cached in memory, so no binary font file
// needs to live in the repo. If the fetch ever fails, we fall back to the
// bundled BigShoulders font so meme generation never breaks entirely.
const IMPACT_STYLE_FONT_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/anton@5.3.0/latin-400-normal.ttf";

let cachedBase = null;
let cachedFontBuffer = null;

// Twemoji PNGs (as base64 data URIs) for any emoji grapheme found in the
// caption text, keyed by grapheme so repeated emoji only get fetched once.
// Cached in memory across invocations, same idea as cachedFontBuffer.
const emojiImageCache = new Map();
const TWEMOJI_VERSION = "14.0.2";

// Matches a single emoji-ish grapheme cluster (regular emoji, ZWJ sequences
// like 👨‍👩‍👧, flags, skin-tone modifiers, keycaps, etc).
const EMOJI_SEGMENT_RE =
  /\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic})*|\p{Regional_Indicator}{2}|[0-9#*]\ufe0f?\u20e3/gu;

// Splits text into an ordered list of unique emoji graphemes it contains.
// Uses Intl.Segmenter when available (correctly keeps multi-codepoint ZWJ
// sequences like family/couple emoji as one grapheme); falls back to the
// regex above on older runtimes.
function findEmojiGraphemes(text) {
  if (!text) return [];
  const found = new Set();
  try {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    for (const { segment } of segmenter.segment(text)) {
      if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment)) {
        found.add(segment);
      }
    }
  } catch {
    for (const match of text.matchAll(EMOJI_SEGMENT_RE)) {
      found.add(match[0]);
    }
  }
  return [...found];
}

// Twemoji filenames are the grapheme's codepoints in lowercase hex, joined
// by "-", with the variation-selector-16 codepoint (fe0f) stripped — the
// same convention Twemoji's own parser uses for its asset filenames.
function graphemeToTwemojiCodepoints(grapheme) {
  return Array.from(grapheme)
    .map((c) => c.codePointAt(0))
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16))
    .join("-");
}

// Fetches (and caches) each emoji grapheme as a base64 data: URI so it can
// be embedded directly in the SVG satori produces. Embedding the raw bytes
// matters here: sharp/librsvg (used to rasterize that SVG later) doesn't
// resolve external <image> URLs, so a plain remote URL would just render
// as a blank box. Any emoji that fails to fetch is silently skipped —
// it'll fall back to whatever the caption font renders for that
// character (usually blank), rather than breaking the whole meme.
async function loadEmojiImages(graphemes) {
  const images = {};
  await Promise.all(
    graphemes.map(async (grapheme) => {
      if (emojiImageCache.has(grapheme)) {
        images[grapheme] = emojiImageCache.get(grapheme);
        return;
      }
      const codepoints = graphemeToTwemojiCodepoints(grapheme);
      const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@${TWEMOJI_VERSION}/assets/72x72/${codepoints}.png`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Twemoji CDN responded with ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;
        emojiImageCache.set(grapheme, dataUri);
        images[grapheme] = dataUri;
      } catch {
        // Skip this emoji — see comment above.
      }
    })
  );
  return images;
}

// Loads the bundled demo photo from lib/assets (not /public). Files under
// /public are served as static CDN assets on Vercel and are NOT reliably
// present on the serverless function's own filesystem, so reading them
// with fs from inside the function tends to fail with ENOENT in
// production even though it works fine locally. Keeping the source image
// under lib/ (same as the font) and listing it in
// next.config.js -> experimental.outputFileTracingIncludes makes sure it
// actually ships with the function bundle.
async function loadDemoImageBuffer() {
  if (cachedBase) return cachedBase;
  try {
    cachedBase = await fs.readFile(BASE_IMAGE_PATH);
    return cachedBase;
  } catch {
    throw new Error(
      "Foto contoh (lib/assets/base.jpg) tidak ketemu di server. Pastikan file itu ada dan " +
        "outputFileTracingIncludes di next.config.js sudah menyertakannya, lalu redeploy."
    );
  }
}

// Loads the meme caption font as a raw buffer for satori (see below for why
// satori, not raw SVG <text>, is what actually draws the caption). Tries the
// Impact-style webfont first, falls back to the bundled font on any error
// (network hiccup, CDN down, etc.) so meme generation keeps working.
async function loadFontBuffer() {
  if (cachedFontBuffer) return cachedFontBuffer;
  try {
    const res = await fetch(IMPACT_STYLE_FONT_URL);
    if (!res.ok) throw new Error(`Font CDN responded with ${res.status}`);
    cachedFontBuffer = Buffer.from(await res.arrayBuffer());
    return cachedFontBuffer;
  } catch {
    cachedFontBuffer = await fs.readFile(FALLBACK_FONT_PATH);
    return cachedFontBuffer;
  }
}

const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;

// Loads the actual photo used as the meme background, in priority order:
// 1) an in-memory buffer handed directly from a multipart upload (no
//    external hosting involved at all), 2) a user-supplied image URL
//    (Catbox link, any public CDN link), or 3) the bundled demo photo.
async function loadBaseImageBuffer({ imageUrl, imageBuffer }) {
  if (imageBuffer) {
    if (imageBuffer.length > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error("Foto yang diunggah terlalu besar (maksimal 12MB).");
    }
    return imageBuffer;
  }

  if (!imageUrl) {
    return loadDemoImageBuffer();
  }

  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("Parameter `image` bukan URL yang valid.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Parameter `image` harus URL http:// atau https://.");
  }

  const res = await fetch(parsed.toString());
  if (!res.ok) {
    throw new Error("Gagal mengambil gambar dari URL yang diberikan di parameter `image`.");
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error("Gambar dari URL terlalu besar (maksimal 12MB).");
  }
  return buffer;
}

const CLAMP = (val, min, max) => Math.min(Math.max(val, min), max);

// Rough greedy word-wrap based on an average glyph-width heuristic.
// Good enough for bold uppercase meme-style text without needing a
// real text-measurement engine on the server.
function wrapText(text, maxWidth, fontSize) {
  const avgCharWidth = fontSize * 0.58;
  const maxChars = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);

  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Splits the two configurable text entries (text/text2) into a "top" slot
// and a "bottom" slot based on each entry's requested position, so any
// combination — top only, bottom only, or both at once (even both entries
// stacked on the same side) — is supported.
function assignSlots({ topText, bottomText, topTextPos, bottomTextPos, maxTextWidth, fontSize }) {
  const slots = { top: [], bottom: [] };

  if (topText) {
    const slot = topTextPos === "bottom" ? "bottom" : "top";
    slots[slot].push(...wrapText(topText, maxTextWidth, fontSize));
  }
  if (bottomText) {
    const slot = bottomTextPos === "top" ? "top" : "bottom";
    slots[slot].push(...wrapText(bottomText, maxTextWidth, fontSize));
  }

  return slots;
}

// Builds one absolutely-positioned block (top or bottom) as a satori
// element: a flex column of line divs, each one its own text node.
// Satori doesn't reliably draw `-webkit-text-stroke`, so the outline is
// faked the old-fashioned way: 8 copies of the same line in the stroke
// color, nudged a few pixels in every direction, with the real fill-color
// copy stacked on top last (later siblings draw over earlier ones).
function outlinedLineNode(line, { fontSize, lineHeight, color, stroke, strokeWidth }) {
  const baseTextStyle = {
    fontFamily: "MemeFont",
    fontWeight: 400,
    fontSize,
    lineHeight,
    whiteSpace: "nowrap",
  };

  const offsets =
    strokeWidth > 0
      ? [
          [-strokeWidth, -strokeWidth],
          [-strokeWidth, 0],
          [-strokeWidth, strokeWidth],
          [0, -strokeWidth],
          [0, strokeWidth],
          [strokeWidth, -strokeWidth],
          [strokeWidth, 0],
          [strokeWidth, strokeWidth],
        ]
      : [];

  return {
    type: "div",
    props: {
      style: { position: "relative", display: "flex", justifyContent: "center" },
      children: [
        ...offsets.map(([left, top]) => ({
          type: "div",
          props: {
            style: { ...baseTextStyle, position: "absolute", top, left, color: stroke },
            children: line,
          },
        })),
        {
          type: "div",
          props: {
            style: { ...baseTextStyle, position: "relative", color },
            children: line,
          },
        },
      ],
    },
  };
}

function textBlockNode({ lines, side, padding, fontSize, color, stroke, strokeWidth, lineHeight }) {
  const positionStyle =
    side === "top" ? { top: padding, left: padding, right: padding } : { bottom: padding, left: padding, right: padding };

  return {
    type: "div",
    props: {
      style: {
        position: "absolute",
        ...positionStyle,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      },
      children: lines.map((line) => outlinedLineNode(line, { fontSize, lineHeight, color, stroke, strokeWidth })),
    },
  };
}

// Renders the caption overlay as a full SVG using satori instead of raw
// SVG <text> elements. This is the key fix for text showing up as tofu
// boxes (□□□□) on Vercel: satori does its own font shaping in pure JS from
// the font buffer we hand it, and outputs the text as already-drawn vector
// <path> shapes. Raw SVG <text>, by contrast, has to be shaped at raster
// time by librsvg/Pango, which needs a working fontconfig — and Vercel's
// serverless containers don't ship one, so any text (even with an
// @font-face embed) silently falls back to a fontless renderer and comes
// out as empty glyph boxes. Satori sidesteps that dependency entirely.
async function renderOverlaySvg({ width, height, topLines, bottomLines, color, stroke, fontSize, fontBuffer, graphemeImages }) {
  const strokeWidth = Math.max(2, Math.round(fontSize * 0.08));
  const lineHeight = 1.05;
  const padding = Math.round(width * 0.04);

  const children = [];
  if (topLines.length) {
    children.push(textBlockNode({ lines: topLines, side: "top", padding, fontSize, color, stroke, strokeWidth, lineHeight }));
  }
  if (bottomLines.length) {
    children.push(textBlockNode({ lines: bottomLines, side: "bottom", padding, fontSize, color, stroke, strokeWidth, lineHeight }));
  }

  return satori(
    {
      type: "div",
      props: {
        style: { width, height, display: "flex", position: "relative" },
        children,
      },
    },
    {
      width,
      height,
      fonts: [{ name: "MemeFont", data: fontBuffer, weight: 400, style: "normal" }],
      graphemeImages,
    }
  );
}

export async function renderStaticMeme({
  width,
  height,
  topText,
  bottomText,
  topTextPos,
  bottomTextPos,
  fontSize,
  color,
  stroke,
  format,
  imageUrl,
  imageBuffer,
}) {
  const [baseBuffer, fontBuffer] = await Promise.all([
    loadBaseImageBuffer({ imageUrl, imageBuffer }),
    loadFontBuffer(),
  ]);
  const emojiGraphemes = findEmojiGraphemes(`${topText ?? ""} ${bottomText ?? ""}`);
  const graphemeImages = await loadEmojiImages(emojiGraphemes);
  const base = sharp(baseBuffer).resize(width, height, { fit: "cover" });

  const padding = Math.round(width * 0.04);
  const maxTextWidth = width - padding * 2;
  const slots = assignSlots({ topText, bottomText, topTextPos, bottomTextPos, maxTextWidth, fontSize });

  const svg = await renderOverlaySvg({
    width,
    height,
    topLines: slots.top,
    bottomLines: slots.bottom,
    color,
    stroke,
    fontSize,
    fontBuffer,
    graphemeImages,
  });

  let pipeline = base.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);

  if (format === "jpg" || format === "jpeg") {
    pipeline = pipeline.jpeg({ quality: 90 });
  } else if (format === "webp") {
    pipeline = pipeline.webp({ quality: 92 });
  } else {
    pipeline = pipeline.png();
  }

  return pipeline.toBuffer();
}

// Builds a short looping GIF: the caption "stamps" in with a quick
// scale/settle animation, then holds for a beat before looping.
export async function renderGifMeme({
  width,
  height,
  topText,
  bottomText,
  topTextPos,
  bottomTextPos,
  fontSize,
  color,
  stroke,
  imageUrl,
  imageBuffer,
}) {
  const [rawBase, fontBuffer] = await Promise.all([
    loadBaseImageBuffer({ imageUrl, imageBuffer }),
    loadFontBuffer(),
  ]);
  const emojiGraphemes = findEmojiGraphemes(`${topText ?? ""} ${bottomText ?? ""}`);
  const graphemeImages = await loadEmojiImages(emojiGraphemes);
  const baseBuffer = await sharp(rawBase).resize(width, height, { fit: "cover" }).png().toBuffer();

  const padding = Math.round(width * 0.04);
  const maxTextWidth = width - padding * 2;

  const FRAME_COUNT = 10;
  const HOLD_FRAMES = 4;
  const scales = [];
  for (let i = 0; i < FRAME_COUNT - HOLD_FRAMES; i++) {
    // simple overshoot/settle easing: 0.4 -> 1.15 -> 1.0
    const t = i / (FRAME_COUNT - HOLD_FRAMES - 1);
    const overshoot = 1 + Math.sin(t * Math.PI) * 0.18 * (1 - t);
    scales.push(0.55 + t * 0.45 * overshoot);
  }
  for (let i = 0; i < HOLD_FRAMES; i++) scales.push(1);

  const gif = GIFEncoder();

  for (let f = 0; f < scales.length; f++) {
    const scale = CLAMP(scales[f], 0.4, 1.25);
    const frameFontSize = CLAMP(Math.round(fontSize * scale), 12, 400);

    const slots = assignSlots({
      topText,
      bottomText,
      topTextPos,
      bottomTextPos,
      maxTextWidth,
      fontSize: frameFontSize,
    });

    const svg = await renderOverlaySvg({
      width,
      height,
      topLines: slots.top,
      bottomLines: slots.bottom,
      color,
      stroke,
      fontSize: frameFontSize,
      fontBuffer,
      graphemeImages,
    });

    const frameBuffer = await sharp(baseBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = frameBuffer;
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);

    gif.writeFrame(index, info.width, info.height, {
      palette,
      delay: f >= scales.length - HOLD_FRAMES ? 700 : 55,
      repeat: 0,
    });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}

export function parseCommonParams(searchParams) {
  const topText = searchParams.get("text") ?? searchParams.get("top") ?? "BELUM SIAP";
  const bottomText = searchParams.get("text2") ?? searchParams.get("bottom") ?? "";
  const imageUrl = searchParams.get("image") ?? searchParams.get("img") ?? "";

  const rawWidth = parseInt(searchParams.get("width") ?? "720", 10);
  const width = CLAMP(Number.isFinite(rawWidth) ? rawWidth : 720, 100, 1600);

  const rawHeight = searchParams.get("height");
  const height = rawHeight ? CLAMP(parseInt(rawHeight, 10) || width, 100, 1600) : width;

  let format = (searchParams.get("format") ?? "png").toLowerCase();
  if (!["png", "jpg", "jpeg", "webp", "gif"].includes(format)) format = "png";

  const color = "#" + (searchParams.get("color")?.replace("#", "") || "ffffff");
  const stroke = "#" + (searchParams.get("stroke")?.replace("#", "") || "000000");

  // Text position: "top" or "bottom" for each of the two text slots.
  // Defaults preserve the original behaviour (text -> top, text2 -> bottom),
  // but either can be flipped, so top-only, bottom-only, or both-on-one-side
  // are all reachable.
  const rawTopPos = (searchParams.get("pos") ?? searchParams.get("position") ?? "top").toLowerCase();
  const topTextPos = rawTopPos === "bottom" ? "bottom" : "top";
  const rawBottomPos = (searchParams.get("pos2") ?? searchParams.get("position2") ?? "bottom").toLowerCase();
  const bottomTextPos = rawBottomPos === "top" ? "top" : "bottom";

  // Text size: explicit pixel size if given, otherwise auto-scaled from
  // the image width like before.
  const rawSize = searchParams.get("size") ?? searchParams.get("fontSize");
  const autoSize = CLAMP(Math.round(width * 0.095), 22, 120);
  const fontSize = rawSize ? CLAMP(parseInt(rawSize, 10) || autoSize, 10, 400) : autoSize;

  return {
    topText,
    bottomText,
    width,
    height,
    format,
    color,
    stroke,
    imageUrl,
    topTextPos,
    bottomTextPos,
    fontSize,
  };
}
