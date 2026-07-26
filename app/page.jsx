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
  const [pos, setPos] = useState("top");
  const [pos2, setPos2] = useState("bottom");
  const [fontSize, setFontSize] = useState(64);
  const [width, setWidth] = useState(720);
  const [height, setHeight] = useState(720);
  const [format, setFormat] = useState("png");
  const [color, setColor] = useState("#ffffff");
  const [stroke, setStroke] = useState("#000000");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [localFile, setLocalFile] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRenderError("");
    setLocalFile(file);
    setFileName(file.name);
    e.target.value = "";
  };

  const resetToDemo = () => {
    setLocalFile(null);
    setFileName("");
    setRenderError("");
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl("");
  };

  const debouncedText = useDebounced(text, 400);
  const debouncedText2 = useDebounced(text2, 400);
  const debouncedWidth = useDebounced(width, 400);
  const debouncedHeight = useDebounced(height, 400);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set("text", debouncedText || "BELUM SIAP");
    if (debouncedText2) params.set("text2", debouncedText2);
    params.set("pos", pos);
    params.set("pos2", pos2);
    params.set("size", String(fontSize || 64));
    params.set("width", String(debouncedWidth || 720));
    params.set("height", String(debouncedHeight || 720));
    params.set("format", format);
    params.set("color", color.replace("#", ""));
    params.set("stroke", stroke.replace("#", ""));
    return `/api/meme?${params.toString()}`;
  }, [debouncedText, debouncedText2, pos, pos2, fontSize, debouncedWidth, debouncedHeight, format, color, stroke]);

  // When a local photo is picked, it never leaves this browser except as
  // a direct POST straight to /api/meme — the render comes back as a
  // buffer/blob, no Catbox or third-party hosting involved.
  useEffect(() => {
    if (!localFile) return;
    let cancelled = false;
    let objectUrl = "";

    const run = async () => {
      setRendering(true);
      setRenderError("");
      try {
        const formData = new FormData();
        formData.append("file", localFile);
        formData.append("text", debouncedText || "BELUM SIAP");
        if (debouncedText2) formData.append("text2", debouncedText2);
        formData.append("pos", pos);
        formData.append("pos2", pos2);
        formData.append("size", String(fontSize || 64));
        formData.append("width", String(debouncedWidth || 720));
        formData.append("height", String(debouncedHeight || 720));
        formData.append("format", format);
        formData.append("color", color.replace("#", ""));
        formData.append("stroke", stroke.replace("#", ""));

        const res = await fetch("/api/meme", { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Gagal bikin gambar dari foto ini.");
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewBlobUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return objectUrl;
        });
      } catch (err) {
        if (!cancelled) setRenderError(err.message || "Gagal bikin gambar, coba lagi.");
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [localFile, debouncedText, debouncedText2, pos, pos2, fontSize, debouncedWidth, debouncedHeight, format, color, stroke]);

  const previewSrc = localFile ? previewBlobUrl : path;
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
          UNEXA<span>GEN</span>
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
            {/* live preview re-fetches whenever the params below change */}
            <img src={previewSrc} alt="Pratinjau meme" width={width} height={height} />
            <div className="preview-caption">
              <span>{width}×{height}px</span>
              <span>.{format}</span>
              {rendering && <span>memproses…</span>}
            </div>
            <div className="stamp" aria-hidden="true">
              {localFile ? "foto" : "contoh"}
              <br />
              {localFile ? "kamu" : "live"}
            </div>
          </div>

          <div className="form-block">
            <div className="field">
              <label htmlFor="photo">Foto dasar</label>
              <div className="upload-row">
                <label className="btn secondary upload-btn" htmlFor="photo">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 16V4M12 4L7 9M12 4L17 9M5 20H19"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {rendering ? "memproses…" : "upload dari galeri"}
                </label>
                <input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={rendering}
                  hidden
                />
                {localFile && (
                  <button type="button" className="btn secondary" onClick={resetToDemo}>
                    pakai foto contoh
                  </button>
                )}
              </div>
              <div className="upload-status">
                {renderError ? (
                  <span className="upload-error">{renderError}</span>
                ) : localFile ? (
                  <span>terpasang: {fileName || "foto kamu"} — diproses langsung di server, nggak diunggah ke hosting manapun</span>
                ) : (
                  <span>lagi pakai foto contoh bawaan — upload foto sendiri kalau mau ganti</span>
                )}
              </div>
            </div>

            <div className="field">
              <div className="field-inline-head">
                <label htmlFor="text">Teks 1</label>
                <select
                  className="pos-select"
                  aria-label="Posisi teks 1"
                  value={pos}
                  onChange={(e) => setPos(e.target.value)}
                >
                  <option value="top">atas</option>
                  <option value="bottom">bawah</option>
                </select>
              </div>
              <input id="text" type="text" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="field">
              <div className="field-inline-head">
                <label htmlFor="text2">Teks 2 (opsional)</label>
                <select
                  className="pos-select"
                  aria-label="Posisi teks 2"
                  value={pos2}
                  onChange={(e) => setPos2(e.target.value)}
                >
                  <option value="top">atas</option>
                  <option value="bottom">bawah</option>
                </select>
              </div>
              <input id="text2" type="text" value={text2} maxLength={80} onChange={(e) => setText2(e.target.value)} />
            </div>

            <div className="field">
              <div className="field-inline-head">
                <label htmlFor="fontSize">Ukuran teks (px)</label>
                <span className="pos-select" style={{ border: "none", padding: 0 }}>
                  {fontSize}px
                </span>
              </div>
              <input
                id="fontSize"
                type="range"
                min={20}
                max={160}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
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

        {localFile ? (
          <div className="receipt">
            <div className="receipt-label">Foto dari HP kamu — diproses langsung, bukan link publik</div>
            <div className="receipt-url">
              Karena fotonya dari perangkat kamu sendiri, hasilnya cuma ada di sesi ini (bukan URL yang bisa dibuka
              orang lain). Unduh hasilnya, atau kalau mau link yang bisa ditempel ke bot, upload dulu fotonya ke
              hosting/CDN kamu sendiri lalu panggil <code>/api/meme?image=&lt;url foto&gt;</code>.
            </div>
            {previewBlobUrl ? (
              <div className="receipt-actions">
                <a className="btn" href={previewBlobUrl} download={`unexagen.${format === "jpeg" ? "jpg" : format}`}>
                  unduh gambar
                </a>
                <a className="btn secondary" href={previewBlobUrl} target="_blank" rel="noreferrer">
                  buka gambar
                </a>
              </div>
            ) : (
              <div className="receipt-actions">
                <span>{rendering ? "lagi diproses…" : "belum ada hasil"}</span>
              </div>
            )}
          </div>
        ) : (
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
        )}
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
              Ganti teksnya lewat parameter <code>text</code> dan <code>text2</code> (boleh dikosongkan). Otomatis
              jadi huruf kapital dan pindah baris sendiri kalau kepanjangan.
            </span>
          </li>
          <li>
            <span>
              Atur posisinya lewat <code>pos</code> dan <code>pos2</code> — masing-masing bisa <code>top</code> atau{" "}
              <code>bottom</code>. Bisa atas-bawah seperti biasa, keduanya di atas, atau keduanya di bawah. Ukuran
              hurufnya diatur lewat <code>size</code> (piksel).
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
              <td>Teks utama. Posisinya diatur lewat <code>pos</code>.</td>
            </tr>
            <tr>
              <td><code>text2</code></td>
              <td>(kosong)</td>
              <td>Teks tambahan. Boleh dikosongkan.</td>
            </tr>
            <tr>
              <td><code>pos</code></td>
              <td>top</td>
              <td>Posisi <code>text</code>: <code>top</code> atau <code>bottom</code>.</td>
            </tr>
            <tr>
              <td><code>pos2</code></td>
              <td>bottom</td>
              <td>
                Posisi <code>text2</code>: <code>top</code> atau <code>bottom</code>. Set <code>pos</code> dan{" "}
                <code>pos2</code> ke sisi yang sama kalau mau dua teks numpuk di satu sisi.
              </td>
            </tr>
            <tr>
              <td><code>size</code></td>
              <td>otomatis</td>
              <td>Ukuran teks dalam piksel. Rentang 10–400. Kosongkan untuk skala otomatis sesuai lebar gambar.</td>
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
        <p className="tagline" style={{ marginBottom: 16 }}>
          Tiap contoh di bawah ada link lengkapnya — tinggal pencet &quot;salin&quot;, langsung bisa ditempel ke bot
          atau website kamu.
        </p>
        <div className="examples">
          <ExampleThumb origin={origin} text="BELUM SIAP" format="png" />
          <ExampleThumb origin={origin} text="MASIH LOADING" format="jpg" />
          <ExampleThumb origin={origin} text="SENIN LAGI" text2="MASIH NGANTUK" format="webp" />
          <ExampleThumb origin={origin} text="LAGI DIPROSES" format="gif" />
          <ExampleThumb
            origin={origin}
            text="BELUM SIAP"
            format="png"
            image="https://picsum.photos/id/237/400/400"
            note="pakai foto eksternal (parameter image)"
          />
          <ExampleThumb
            origin={origin}
            text="GEDE BANGET"
            format="png"
            size="110"
            note="ukuran teks custom (parameter size)"
          />
          <ExampleThumb
            origin={origin}
            text="BARIS SATU"
            text2="BARIS DUA"
            pos2="top"
            format="png"
            note="dua teks numpuk di atas (pos2=top)"
          />
          <ExampleThumb
            origin={origin}
            text="DI BAWAH DOANG"
            pos="bottom"
            format="png"
            note="teks tunggal di bawah (pos=bottom)"
          />
        </div>
      </section>

      <footer className="footer">
        <span>bebas dipakai — tempel, embed, atau panggil dari bot kesayanganmu.</span>
        <span>UNEXAGEN</span>
      </footer>
    </main>
  );
}

function ExampleThumb({ origin, text, text2, format, image, pos, pos2, size, note }) {
  const [copied, setCopied] = useState(false);
  const params = new URLSearchParams({ text, width: "260", height: "260", format });
  if (text2) params.set("text2", text2);
  if (image) params.set("image", image);
  if (pos) params.set("pos", pos);
  if (pos2) params.set("pos2", pos2);
  if (size) params.set("size", size);
  const path = `/api/meme?${params.toString()}`;
  const fullUrl = origin ? `${origin}${path}` : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — user can still select the text manually
    }
  };

  return (
    <figure>
      <img src={path} alt={text} loading="lazy" />
      <figcaption>{note || `?text=${encodeURIComponent(text)}&format=${format}`}</figcaption>
      <div className="example-url">{fullUrl}</div>
      <button type="button" className="btn secondary example-copy" onClick={copy}>
        {copied ? "✓ tersalin" : "salin link"}
      </button>
    </figure>
  );
}
