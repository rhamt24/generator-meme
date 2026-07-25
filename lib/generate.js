import sharp from "sharp";
import path from "path";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const BASE_IMAGE_PATH = path.join(process.cwd(), "public", "base.jpg");

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
  const avgCharWidth = fontSize * 0.62;
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
      font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
      font-weight="900"
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

async function buildOverlaySvg({ width, height, topText, bottomText, color, stroke }) {
  const fontSize = CLAMP(Math.round(width * 0.095), 22, 120);
  const strokeWidth = Math.max(2, Math.round(fontSize * 0.09));
  const lineHeight = Math.round(fontSize * 1.08);
  const padding = Math.round(width * 0.04);
  const maxTextWidth = width - padding * 2;

  let svgParts = [];

  if (topText) {
    const lines = wrapText(topText, maxTextWidth, fontSize);
    const y = padding + fontSize * 0.85;
    svgParts.push(
      buildTextBlockSvg({
        lines,
        fontSize,
        color,
        stroke,
        strokeWidth,
        cx: width / 2,
        y,
        lineHeight,
      })
    );
  }

  if (bottomText) {
    const lines = wrapText(bottomText, maxTextWidth, fontSize);
    const totalHeight = lines.length * lineHeight;
    const y = height - padding - totalHeight + fontSize * 0.85;
    svgParts.push(
      buildTextBlockSvg({
        lines,
        fontSize,
        color,
        stroke,
        strokeWidth,
        cx: width / 2,
        y,
        lineHeight,
      })
    );
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgParts.join("\n")}
    </svg>
  `;
}

export async function renderStaticMeme({ width, height, topText, bottomText, color, stroke, format }) {
  const base = sharp(BASE_IMAGE_PATH).resize(width, height, { fit: "cover" });
  const svg = await buildOverlaySvg({ width, height, topText, bottomText, color, stroke });

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
export async function renderGifMeme({ width, height, topText, bottomText, color, stroke }) {
  const baseBuffer = await sharp(BASE_IMAGE_PATH).resize(width, height, { fit: "cover" }).png().toBuffer();

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
    const fontSize = CLAMP(Math.round(width * 0.095 * scale), 18, 130);
    const strokeWidth = Math.max(2, Math.round(fontSize * 0.09));
    const lineHeight = Math.round(fontSize * 1.08);
    const padding = Math.round(width * 0.04);
    const maxTextWidth = width - padding * 2;

    let svgParts = [];
    if (topText) {
      const lines = wrapText(topText, maxTextWidth, fontSize);
      const y = padding + fontSize * 0.85;
      svgParts.push(
        buildTextBlockSvg({ lines, fontSize, color, stroke, strokeWidth, cx: width / 2, y, lineHeight })
      );
    }
    if (bottomText) {
      const lines = wrapText(bottomText, maxTextWidth, fontSize);
      const totalHeight = lines.length * lineHeight;
      const y = height - padding - totalHeight + fontSize * 0.85;
      svgParts.push(
        buildTextBlockSvg({ lines, fontSize, color, stroke, strokeWidth, cx: width / 2, y, lineHeight })
      );
    }

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svgParts.join("")}</svg>`;

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

  const rawWidth = parseInt(searchParams.get("width") ?? "720", 10);
  const width = CLAMP(Number.isFinite(rawWidth) ? rawWidth : 720, 100, 1600);

  const rawHeight = searchParams.get("height");
  const height = rawHeight ? CLAMP(parseInt(rawHeight, 10) || width, 100, 1600) : width;

  let format = (searchParams.get("format") ?? "png").toLowerCase();
  if (!["png", "jpg", "jpeg", "webp", "gif"].includes(format)) format = "png";

  const color = "#" + (searchParams.get("color")?.replace("#", "") || "ffffff");
  const stroke = "#" + (searchParams.get("stroke")?.replace("#", "") || "000000");

  return { topText, bottomText, width, height, format, color, stroke };
}
