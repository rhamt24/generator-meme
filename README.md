# UNEXAGEN

Generator meme berbasis URL. Foto dasarnya bebas — bisa pakai foto contoh
bawaan, upload foto sendiri dari galeri lewat halaman web, atau (kalau manggil
API-nya langsung) kirim link foto dari CDN apa pun lewat parameter `image`.
Teks di atasnya diatur lewat parameter URL (isi, posisi atas/bawah, ukuran),
jadi bisa dipanggil dari bot, chat, atau aplikasi apa pun yang bisa buka URL.

## Menjalankan di lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

> Kalau develop lewat Termux dan `sharp` gagal ke-install (butuh binary
> native), install-nya bisa di komputer lain lalu commit `package-lock.json`.
> Vercel bakal otomatis ambil binary yang sesuai untuk servernya sendiri
> (Linux x64), jadi tidak masalah kalau di HP/Termux beda arsitektur.

## Deploy ke Vercel — PENTING biar tidak 404

Penyebab paling umum semua halaman jadi `404` setelah deploy adalah folder
project ini ikut ter-nested (folder `unexagen` ada di **dalam** repo, bukan
jadi isi repo itu sendiri). Vercel jadi bingung cari `app/page.jsx`-nya.

Cara amannya, jalankan `git init` **di dalam** folder hasil extract, bukan di
folder induknya:

```bash
cd unexagen             # masuk dulu ke folder hasil extract
git init
git add .
git commit -m "init unexagen"
git branch -M main
git remote add origin <url-repo-github-kamu>
git push -u origin main
```

Setelah itu:

1. Buka [vercel.com/new](https://vercel.com/new), import repo tadi.
2. Framework preset otomatis kedeteksi **Next.js** — tidak perlu ubah apa-apa.
3. Kalau kamu terlanjur push dengan folder ter-nested, tinggal buka
   **Project Settings → General → Root Directory**, isi dengan nama folder
   itu (misalnya `unexagen`), lalu redeploy.
4. Setelah selesai, coba buka `https://<domain-kamu>.vercel.app/api/meme?text=TES`
   langsung dari browser — kalau muncul gambar, berarti sudah beres.

## Struktur penting

- `lib/assets/base.jpg` — foto contoh yang dipakai kalau tidak ada foto lain
  diberikan. **Ganti file ini** (bukan yang di `public/`) kalau mau ganti foto
  contoh default — lihat bagian "Kalau mau ganti foto contoh" di bawah.
- `app/api/meme/route.js` — endpoint utama. `GET` bikin gambar dari foto
  contoh atau URL foto (parameter `image`). `POST` menerima foto langsung
  dari form upload di web (multipart `file` + parameter teks lainnya) dan
  merender-nya langsung dari buffer di memori — foto tidak pernah diunggah
  ke hosting pihak ketiga mana pun (tidak ada Catbox atau CDN eksternal
  yang dilibatkan untuk upload dari galeri).
- `lib/generate.js` — logika render teks + gambar (`sharp`) dan GIF animasi
  stempel (`gifenc`). Font teks di-embed langsung dari `lib/fonts/`.
- `lib/fonts/BigShoulders-Bold.ttf` — font meme bawaan (OFL), di-embed
  base64 ke SVG saat render supaya tidak bergantung font sistem server.
- `app/page.jsx` — halaman UI: upload foto, form teks, live preview,
  dokumentasi parameter.

## Kalau mau ganti foto contoh

Foto contoh (dipakai kalau tidak ada `image=` atau upload) disimpan di
`lib/assets/base.jpg`, **bukan** di `public/base.jpg`. Ini sengaja: file di
`public/` dilayani sebagai static asset lewat CDN Vercel dan **tidak ikut**
ke filesystem serverless function-nya, jadi kalau dibaca pakai `fs` dari
dalam function, hasilnya `ENOENT` (gagal ditemukan) walau nampak baik-baik
saja pas dites lokal.

Langkahnya:

1. Timpa file `lib/assets/base.jpg` dengan foto barumu (nama file harus
   tetap sama, atau ubah `BASE_IMAGE_PATH` di `lib/generate.js`).
2. Pastikan `next.config.js` → `experimental.outputFileTracingIncludes`
   masih menyertakan path file itu.
3. Redeploy.

## Parameter endpoint `GET /api/meme`

| Parameter | Default        | Keterangan                                                        |
| --------- | -------------- | ------------------------------------------------------------------ |
| `image`   | foto contoh    | URL foto yang mau dipakai jadi dasar meme (Catbox, Imgur, CDN lain) |
| `text`    | `BELUM SIAP`   | Teks utama. Posisinya diatur lewat `pos`                            |
| `text2`   | *(kosong)*     | Teks tambahan, opsional. Posisinya diatur lewat `pos2`              |
| `pos`     | `top`          | Posisi `text`: `top` atau `bottom`                                  |
| `pos2`    | `bottom`       | Posisi `text2`: `top` atau `bottom`. Samakan dengan `pos` kalau mau dua teks numpuk di satu sisi |
| `size`    | otomatis       | Ukuran teks (px), 10–400. Kosongkan untuk skala otomatis sesuai lebar gambar |
| `width`   | `720`          | Lebar hasil (px), 100–1600                                          |
| `height`  | `720`          | Tinggi hasil (px), 100–1600                                         |
| `format`  | `png`          | `png` / `jpg` / `webp` / `gif`                                      |
| `color`   | `ffffff`       | Warna teks, hex tanpa `#`                                           |
| `stroke`  | `000000`       | Warna outline teks, hex tanpa `#`                                   |

Contoh — pakai foto sendiri dari CDN, teks 2 baris (keduanya di bawah), ukuran
custom, format gif:

```
/api/meme?image=https://files.catbox.moe/contoh.jpg&text=DEADLINE+BESOK&text2=TAPI+BELUM+MULAI&pos=bottom&pos2=bottom&size=70&format=gif&width=500&height=500
```

## Font teks meme

Teksnya pakai **Anton** (Google Font, lisensi OFL — bebas dipakai ulang),
bentuknya tebal-kapital-rapat, gaya klasik meme ala Impact. Font aslinya
(**Impact**) punya lisensi Monotype yang proprietary dan nggak boleh
di-redistribute, jadi Anton dipakai sebagai pengganti gratis yang paling
mirip.

Font-nya di-fetch sekali dari CDN Fontsource/jsDelivr
(`https://cdn.jsdelivr.net/fontsource/fonts/anton@5.3.0/latin-400-normal.ttf`)
terus di-cache di memory, jadi nggak perlu nyimpen file `.ttf` besar di
repo. Kalau fetch itu gagal (misal CDN lagi down), otomatis fallback ke
`lib/fonts/BigShoulders-Bold.ttf` yang tetap ke-bundle di repo, biar
generate meme nggak pernah benar-benar rusak.

Cara nge-render teksnya pakai **[satori](https://github.com/vercel/satori)**
(library yang sama yang dipakai `next/og` / `@vercel/og`), bukan tag SVG
`<text>` biasa. Ini bukan cuma soal gaya — ini fix buat masalah teks yang
muncul sebagai kotak-kotak (tofu box, □□□□) waktu di-deploy ke Vercel:

- Tag SVG `<text>` itu di-raster oleh `librsvg`, yang di baliknya butuh
  **Pango + Fontconfig** buat nge-shape hurufnya — termasuk kalau font-nya
  di-embed sendiri lewat `@font-face`. Container serverless Vercel **tidak
  ada fontconfig ter-install sama sekali**, jadi Pango gagal nemuin font
  apa pun (termasuk yang di-embed) dan hasilnya kotak kosong.
- `satori` beda: dia nge-shape teksnya sendiri di JavaScript murni langsung
  dari file font-nya (nggak lewat Pango/fontconfig sama sekali), lalu
  ngeluarin hasilnya sebagai SVG yang teksnya udah jadi bentuk vektor
  (`<path>`), bukan tag `<text>` lagi. Pas SVG itu ditempel ke foto pakai
  `sharp`, librsvg cuma perlu gambar bentuk vektornya doang — nggak perlu
  nge-shape huruf lagi, jadi nggak butuh fontconfig sama sekali.

> Kalau masih muncul baris `Fontconfig error: Cannot load default config
> file` di log Vercel, itu masih bisa muncul (fontconfig dipanggil di
> tempat lain oleh librsvg), tapi ini beneran cuma warning — teksnya sudah
> nggak lewat jalur itu lagi.

Kalau mau ganti ke font lain:

- **Ganti ke font lain yang di-fetch dari CDN** (cara paling gampang, kayak
  Anton sekarang): update `IMPACT_STYLE_FONT_URL` di `lib/generate.js` ke
  URL `.ttf` font Fontsource lain, dan sesuaikan `weight` di
  `renderOverlaySvg` (parameter `fonts: [...]`) sama `fontWeight` di
  `outlinedLineNode` supaya cocok sama weight font barunya.
- **Bundle file font sendiri** (kalau punya lisensi font-nya, misalnya font
  Impact asli yang dibeli): taruh file `.ttf` di `lib/fonts/`, lalu ganti
  `loadFontBuffer()` di `lib/generate.js` supaya baca file itu langsung
  lewat `fs.readFile` (nggak usah fetch dari CDN lagi), dan pastikan
  `outputFileTracingIncludes` di `next.config.js` menyertakan file itu
  supaya ikut ter-bundle ke serverless function-nya.
- Kalau pakai font dari Google Fonts / Fontsource, semuanya lisensi OFL
  jadi aman buat dipakai ulang begini.

> **Catatan tentang outline teks:** satori tidak menggambar
> `-webkit-text-stroke` dengan benar (sempat bikin outline teks hilang total
> walau warnanya sudah diset). Jadi outline-nya dibikin manual: tiap baris
> teks digambar 8 kali dengan warna `stroke`, digeser beberapa piksel ke
> segala arah, baru teks asli warna `color` ditumpuk di atasnya paling
> akhir — trik outline klasik dari sebelum `text-stroke` ada di CSS.

> **Catatan:** aku nulis bagian `satori` ini tanpa bisa nge-tes langsung di
> sandbox (nggak ada akses internet buat `npm install satori` di sini),
> jadi tolong jalanin `npm install && npm run dev` dan tes beberapa
> kombinasi teks/posisi/ukuran dulu di lokal sebelum deploy ulang ke
> Vercel. Kalau ada error pas testing, tinggal kirim pesan errornya.
