import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const BASE_IMAGE_PATH = path.join(process.cwd(), "public", "base.jpg");
const FONT_PATH = path.join(process.cwd(), "lib", "fonts", "BigShoulders-Bold.ttf");

let cachedBase = null;
let cachedFontBase64 = null;

// Loads the bundled demo photo. On Vercel, files under /public are not
// always guaranteed to be included in the serverless function's file trace
// when read via fs, so if the direct read fails we fall back to fetching
// the same file from its public static URL instead.
async function loadDemoImageBuffer(origin) {
  if (cachedBase) return cachedBase;

  try {
    cachedBase = await fs.readFile(BASE_IMAGE_PATH);
    return cachedBase;
  } catch (fsErr) {
    if (!origin) throw fsErr;
    const res = await fetch(`${origin}/base.jpg`);
    if (!res.ok) {
      throw new Error("Foto contoh (base.jpg) tidak ditemukan di server maupun lewat URL publik.");
    }
    cachedBase = Buffer.from(await res.arrayBuffer());
    return cachedBase;
  }
}

// Loads the bundled meme font and caches it as base64 so it can be
// embedded directly inside the SVG overlay via @font-face. This is what
// makes the text render as actual glyphs instead of tofu boxes — a
// serverless container has no system fonts installed, so librsvg has
// nothing to fall back on unless the font is shipped inside the SVG itself.
async function loadFontBase64() {
  if (cachedFontBase64) return cachedFontBase64;
  const buffer = await fs.readFile(FONT_PATH);
  cachedFontBase64 = buffer.toString("base64");
  return cachedFontBase64;
}

const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;

// Loads the actual photo used as the meme background, in priority order:
// 1) an in-memory buffer handed directly from a multipart upload (no
//    external hosting involved at all), 2) a user-supplied image URL
//    (Catbox link, any public CDN link), or 3) the bundled demo photo.
async function loadBaseImageBuffer({ origin, imageUrl, imageBuffer }) {
  if (imageBuffer) {
    if (imageBuffer.length > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error("Foto yang diunggah terlalu besar (maksimal 12MB).");
    }
    return imageBuffer;
  }

  if (!imageUrl) {
    return loadDemoImageBuffer(origin);
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

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

function buildTextBlockSvg({ lines, fontSize, color, stroke, strokeWidth, cx, y, lineHeight, anchor = "middle" }) {
  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${cx}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `
    <text
      x="${cx}"
      y="${y}"
      class="meme-text"
      font-size="${fontSize}"
      fill="${color}"
      stroke="${stroke}"
      stroke-width="${strokeWidth}"
      stroke-linejoin="round"
      paint-order="stroke fill"
      text-anchor="${anchor}"
      letter-spacing="1"
    >${tspans}</text>
  `;
}

function fontFaceStyle(fontBase64) {
  return `
    <style>
      @font-face {
        font-family: 'MemeFont';
        src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
        font-weight: 700;
      }
      .meme-text {
        font-family: 'MemeFont', 'Arial Black', sans-serif;
        font-weight: 700;
      }
    </style>
  `;
}

// topLines / bottomLines are pre-wrapped arrays of already-uppercased
// strings, one array per on-screen slot. Multiple text entries assigned
// to the same slot (e.g. both text and text2 set to "top") are simply
// stacked in the order given.
async function buildOverlaySvg({ width, height, topLines, bottomLines, color, stroke, fontSize, fontBase64 }) {
  const strokeWidth = Math.max(2, Math.round(fontSize * 0.09));
  const lineHeight = Math.round(fontSize * 1.08);
  const padding = Math.round(width * 0.04);

  let svgParts = [];

  if (topLines.length) {
    const y = padding + fontSize * 0.85;
    svgParts.push(
      buildTextBlockSvg({ lines: topLines, fontSize, color, stroke, strokeWidth, cx: width / 2, y, lineHeight })
    );
  }

  if (bottomLines.length) {
    const totalHeight = bottomLines.length * lineHeight;
    const y = height - padding - totalHeight + fontSize * 0.85;
    svgParts.push(
      buildTextBlockSvg({ lines: bottomLines, fontSize, color, stroke, strokeWidth, cx: width / 2, y, lineHeight })
    );
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${fontFaceStyle(fontBase64)}
      ${svgParts.join("\n")}
    </svg>
  `;
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
  origin,
  imageUrl,
  imageBuffer,
}) {
  const [baseBuffer, fontBase64] = await Promise.all([
    loadBaseImageBuffer({ origin, imageUrl, imageBuffer }),
    loadFontBase64(),
  ]);
  const base = sharp(baseBuffer).resize(width, height, { fit: "cover" });

  const padding = Math.round(width * 0.04);
  const maxTextWidth = width - padding * 2;
  const slots = assignSlots({ topText, bottomText, topTextPos, bottomTextPos, maxTextWidth, fontSize });

  const svg = await buildOverlaySvg({
    width,
    height,
    topLines: slots.top,
    bottomLines: slots.bottom,
    color,
    stroke,
    fontSize,
    fontBase64,
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
  origin,
  imageUrl,
  imageBuffer,
}) {
  const [rawBase, fontBase64] = await Promise.all([
    loadBaseImageBuffer({ origin, imageUrl, imageBuffer }),
    loadFontBase64(),
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
    scales.push(0.55 + t * 0.45 * overshoot + (t === 1 ? 0 : 0));
  }
  for (let i = 0; i < HOLD_FRAMES; i++) scales.push(1);

  const gif = GIFEncoder();

  for (let f = 0; f < scales.length; f++) {
    const scale = CLAMP(scales[f], 0.4, 1.25);
    const frameFontSize = CLAMP(Math.round(fontSize * scale), 12, 400);
    const strokeWidth = Math.max(2, Math.round(frameFontSize * 0.09));
    const lineHeight = Math.round(frameFontSize * 1.08);

    const slots = assignSlots({
      topText,
      bottomText,
      topTextPos,
      bottomTextPos,
      maxTextWidth,
      fontSize: frameFontSize,
    });

    let svgParts = [];
    if (slots.top.length) {
      const y = padding + frameFontSize * 0.85;
      svgParts.push(
        buildTextBlockSvg({
          lines: slots.top,
          fontSize: frameFontSize,
          color,
          stroke,
          strokeWidth,
          cx: width / 2,
          y,
          lineHeight,
        })
      );
    }
    if (slots.bottom.length) {
      const totalHeight = slots.bottom.length * lineHeight;
      const y = height - padding - totalHeight + frameFontSize * 0.85;
      svgParts.push(
        buildTextBlockSvg({
          lines: slots.bottom,
          fontSize: frameFontSize,
          color,
          stroke,
          strokeWidth,
          cx: width / 2,
          y,
          lineHeight,
        })
      );
    }

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${fontFaceStyle(
      fontBase64
    )}${svgParts.join("")}</svg>`;

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
