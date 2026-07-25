"use client";

import { useEffect, useMemo, useState } from "react";

const FORMATS = ["png", "jpg", "webp", "gif"];

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Page() {
  const [text, setText] = useState("BELUM SIAP");
  const [text2, setText2] = useState("");
  const [width, setWidth] = useState(720);
  const [height, setHeight] = useState(720);
  const [format, setFormat] = useState("png");
  const [color, setColor] = useState("#ffffff");
  const [stroke, setStroke] = useState("#000000");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload gagal.");
      setImageUrl(data.url);
      setFileName(file.name);
    } catch (err) {
      setUploadError(err.message || "Upload gagal, coba lagi.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const resetToDemo = () => {
    setImageUrl("");
    setFileName("");
    setUploadError("");
  };

  const debouncedText = useDebounced(text, 400);
  const debouncedText2 = useDebounced(text2, 400);
  const debouncedWidth = useDebounced(width, 400);
  const debouncedHeight = useDebounced(height, 400);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set("text", debouncedText || "BELUM SIAP");
    if (debouncedText2) params.set("text2", debouncedText2);
    params.set("width", String(debouncedWidth || 720));
    params.set("height", String(debouncedHeight || 720));
    params.set("format", format);
    params.set("color", color.replace("#", ""));
    params.set("stroke", stroke.replace("#", ""));
    if (imageUrl) params.set("image", imageUrl);
    return `/api/meme?${params.toString()}`;
  }, [debouncedText, debouncedText2, debouncedWidth, debouncedHeight, format, color, stroke, imageUrl]);

  const fullUrl = origin ? `${origin}${path}` : path;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — user can still select the text manually
    }
  };

  return (
    <main className="wrap">
      <header className="letterhead">
        <h1 className="wordmark">
          BELUMSIAP<span>.GEN</span>
        </h1>
        <div className="memo-meta">
          <span className="live-dot" aria-hidden="true" />
          generator aktif
        </div>
      </header>
      <p className="tagline">
        Generator gambar meme lewat URL — pakai foto contoh yang sudah ada, atau upload foto sendiri dari galeri.
        Atur teksnya, atur ukurannya, tinggal tempel link-nya ke bot, chat, atau website kamu.
      </p>

      <section className="pasal" id="coba">
        <div className="pasal-head">
          <span className="pasal-num">Live demo</span>
          <h2 className="pasal-title">Bikin Meme-nya</h2>
        </div>

        <div className="hero">
          <div className="preview-frame">
            {/* live preview re-fetches whenever the URL below changes */}
            <img src={path} alt="Pratinjau meme" width={width} height={height} />
            <div className="preview-caption">
              <span>{width}×{height}px</span>
              <span>.{format}</span>
            </div>
            <div className="stamp" aria-hidden="true">
              {imageUrl ? "foto" : "contoh"}
              <br />
              {imageUrl ? "kamu" : "live"}
            </div>
          </div>

          <div className="form-block">
            <div className="field">
              <label htmlFor="photo">Foto dasar</label>
              <div className="upload-row">
                <label className="btn secondary upload-btn" htmlFor="photo">
                  {uploading ? "mengunggah…" : "upload dari galeri"}
                </label>
                <input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={uploading}
                  hidden
                />
                {imageUrl && (
                  <button type="button" className="btn secondary" onClick={resetToDemo}>
                    pakai foto contoh
                  </button>
                )}
              </div>
              <div className="upload-status">
                {uploadError ? (
                  <span className="upload-error">{uploadError}</span>
                ) : imageUrl ? (
                  <span>terpasang: {fileName || "foto kamu"}</span>
                ) : (
                  <span>lagi pakai foto contoh bawaan — upload foto sendiri kalau mau ganti</span>
                )}
              </div>
            </div>

            <div className="field">
              <label htmlFor="text">Teks atas</label>
              <input id="text" type="text" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="text2">Teks bawah (opsional)</label>
              <input id="text2" type="text" value={text2} maxLength={80} onChange={(e) => setText2(e.target.value)} />
            </div>

            <div className="field row2">
              <div>
                <label htmlFor="width">Lebar (px)</label>
                <input
                  id="width"
                  type="text"
                  inputMode="numeric"
                  value={width}
                  onChange={(e) => setWidth(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div>
                <label htmlFor="height">Tinggi (px)</label>
                <input
                  id="height"
                  type="text"
                  inputMode="numeric"
                  value={height}
                  onChange={(e) => setHeight(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>

            <div className="field">
              <label>Format keluaran</label>
              <div className="chips">
                {FORMATS.map((f) => (
                  <button key={f} type="button" className="chip" data-active={format === f} onClick={() => setFormat(f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="field row2">
              <div>
                <label htmlFor="color">Warna teks</label>
                <div className="color-field">
                  <input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{color}</span>
                </div>
              </div>
              <div>
                <label htmlFor="stroke">Warna outline</label>
                <div className="color-field">
                  <input id="stroke" type="color" value={stroke} onChange={(e) => setStroke(e.target.value)} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{stroke}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="receipt">
          <div className="receipt-label">GET URL — salin &amp; pakai di mana saja</div>
          <div className="receipt-url">{fullUrl}</div>
          <div className="receipt-actions">
            <button className={`btn ${copied ? "stamped" : ""}`} onClick={copyUrl}>
              {copied ? "✓ tersalin" : "salin url"}
            </button>
            <a className="btn secondary" href={path} target="_blank" rel="noreferrer">
              buka gambar
            </a>
          </div>
        </div>
      </section>

      <section className="pasal" id="cara-pakai">
        <div className="pasal-head">
          <span className="pasal-num">Panduan</span>
          <h2 className="pasal-title">Cara Pakai</h2>
        </div>
        <ol className="clauses">
          <li>
            <span>
              Gambarnya dibuat langsung oleh endpoint <code>GET /api/meme</code> — nggak perlu login atau API key.
              Tinggal buka URL-nya di browser, atau panggil dari bot/aplikasi, gambarnya langsung muncul.
            </span>
          </li>
          <li>
            <span>
              Mau pakai foto sendiri? Upload dari galeri di form atas, atau — kalau manggil API-nya langsung — kirim
              parameter <code>image</code> berisi URL foto (link dari Catbox, Imgur, CDN kamu sendiri, bebas). Kalau
              parameter ini dikosongkan, otomatis pakai foto contoh bawaan.
            </span>
          </li>
          <li>
            <span>
              Ganti teksnya lewat parameter <code>text</code> (teks atas) dan <code>text2</code> (teks bawah, boleh
              dikosongkan). Otomatis jadi huruf kapital dan pindah baris sendiri kalau kepanjangan.
            </span>
          </li>
          <li>
            <span>
              Atur ukuran gambarnya dengan <code>width</code> dan <code>height</code> (satuan piksel) — pas buat
              thumbnail bot, story, atau kotak profil.
            </span>
          </li>
          <li>
            <span>
              Mau versi gerak? Ganti <code>format</code> jadi <code>gif</code>, teksnya bakal muncul dengan efek
              "cap stempel". Buat gambar diam, pakai <code>png</code>, <code>jpg</code>, atau <code>webp</code>.
            </span>
          </li>
          <li>
            <span>
              Tempel URL-nya di mana pun yang bisa nampilin gambar dari link — bot WhatsApp, embed Discord,
              Telegram, atau <code>&lt;img&gt;</code> biasa di halaman web kamu.
            </span>
          </li>
        </ol>
      </section>

      <section className="pasal" id="parameter">
        <div className="pasal-head">
          <span className="pasal-num">Referensi</span>
          <h2 className="pasal-title">Parameter yang Bisa Diatur</h2>
        </div>
        <table className="ptable">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Default</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>image</code></td>
              <td>foto contoh</td>
              <td>URL foto yang mau dipakai jadi dasar meme. Kosongkan untuk pakai foto contoh bawaan.</td>
            </tr>
            <tr>
              <td><code>text</code></td>
              <td>BELUM SIAP</td>
              <td>Teks yang ditampilkan di bagian atas gambar.</td>
            </tr>
            <tr>
              <td><code>text2</code></td>
              <td>(kosong)</td>
              <td>Teks tambahan di bagian bawah gambar. Boleh dikosongkan.</td>
            </tr>
            <tr>
              <td><code>width</code></td>
              <td>720</td>
              <td>Lebar gambar dalam piksel. Rentang 100–1600.</td>
            </tr>
            <tr>
              <td><code>height</code></td>
              <td>720</td>
              <td>Tinggi gambar dalam piksel. Rentang 100–1600.</td>
            </tr>
            <tr>
              <td><code>format</code></td>
              <td>png</td>
              <td>Salah satu: <code>png</code>, <code>jpg</code>, <code>webp</code>, <code>gif</code>.</td>
            </tr>
            <tr>
              <td><code>color</code></td>
              <td>ffffff</td>
              <td>Warna isi teks, kode hex tanpa tanda pagar.</td>
            </tr>
            <tr>
              <td><code>stroke</code></td>
              <td>000000</td>
              <td>Warna garis pinggir (outline) teks, kode hex tanpa tanda pagar.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="pasal" id="contoh">
        <div className="pasal-head">
          <span className="pasal-num">Galeri</span>
          <h2 className="pasal-title">Contoh Cepat</h2>
        </div>
        <div className="examples">
          <ExampleThumb text="BELUM SIAP" format="png" />
          <ExampleThumb text="MASIH LOADING" format="jpg" />
          <ExampleThumb text="SENIN LAGI" text2="MASIH NGANTUK" format="webp" />
          <ExampleThumb text="LAGI DIPROSES" format="gif" />
        </div>
      </section>

      <footer className="footer">
        <span>bebas dipakai — tempel, embed, atau panggil dari bot kesayanganmu.</span>
        <span>BELUMSIAP.GEN</span>
      </footer>
    </main>
  );
}

function ExampleThumb({ text, text2, format }) {
  const params = new URLSearchParams({ text, width: "260", height: "260", format });
  if (text2) params.set("text2", text2);
  const src = `/api/meme?${params.toString()}`;
  return (
    <figure>
      <img src={src} alt={text} loading="lazy" />
      <figcaption>?text={encodeURIComponent(text)}&amp;format={format}</figcaption>
    </figure>
  );
}
