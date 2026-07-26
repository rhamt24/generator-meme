import sharp from "sharp";
import satori from "satori";
import fs from "fs/promises";
import path from "path";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const BASE_IMAGE_PATH = path.join(process.cwd(), "lib", "assets", "base.jpg");
const FONT_PATH = path.join(process.cwd(), "lib", "fonts", "BigShoulders-Bold.ttf");

let cachedBase = null;
let cachedFontBuffer = null;

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

// Loads the bundled meme font as a raw buffer for satori (see below for why
// satori, not raw SVG <text>, is what actually draws the caption).
async function loadFontBuffer() {
  if (cachedFontBuffer) return cachedFontBuffer;
  cachedFontBuffer = await fs.readFile(FONT_PATH);
  return cachedFontBuffer;
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
    fontWeight: 700,
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
async function renderOverlaySvg({ width, height, topLines, bottomLines, color, stroke, fontSize, fontBuffer }) {
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
      fonts: [{ name: "MemeFont", data: fontBuffer, weight: 700, style: "normal" }],
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
