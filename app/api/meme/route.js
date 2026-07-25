import { NextResponse } from "next/server";
import { renderStaticMeme, renderGifMeme, parseCommonParams } from "../../../lib/generate";

export const runtime = "nodejs";

const CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const params = { ...parseCommonParams(url.searchParams), origin: url.origin };

    let buffer;
    if (params.format === "gif") {
      buffer = await renderGifMeme(params);
    } else {
      buffer = await renderStaticMeme(params);
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[params.format],
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Gagal membuat gambar.", detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// Renders directly from a photo the user picked on their own device.
// The file never leaves this server: it's read straight into a Buffer
// and handed to sharp, no Catbox / third-party hosting involved.
export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Tidak ada file yang dikirim." }, { status: 400 });
    }
    if (!file.type?.startsWith("image/")) {
      return NextResponse.json({ error: "File harus berupa gambar." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Ukuran gambar maksimal 8MB." }, { status: 400 });
    }

    const url = new URL(request.url);
    const params = { ...parseCommonParams(form), origin: url.origin };
    params.imageBuffer = Buffer.from(await file.arrayBuffer());

    let buffer;
    if (params.format === "gif") {
      buffer = await renderGifMeme(params);
    } else {
      buffer = await renderStaticMeme(params);
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[params.format],
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Gagal membuat gambar.", detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}
