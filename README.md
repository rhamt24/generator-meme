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

Teks dirender pakai **Big Shoulders Bold** (Google Font, lisensi OFL —
bebas dipakai ulang), file-nya ada di `lib/fonts/BigShoulders-Bold.ttf`.
Font ini di-embed langsung sebagai base64 di dalam SVG overlay saat
render, bukan dipanggil lewat nama font sistem. Ini penting karena
container serverless di Vercel **tidak punya font apa pun ter-install** —
kalau font dipanggil lewat nama biasa (mis. `font-family: 'Arial Black'`),
hasilnya teks muncul sebagai kotak-kotak (tofu box) karena tidak ada
glyph yang cocok untuk digambar.

> Catatan: kadang di log Vercel muncul baris
> `Fontconfig error: Cannot load default config file: No such file: (null)`.
> Itu cuma warning bawaan dari library gambar (librsvg) karena container
> serverless memang tidak punya `fontconfig` ter-install — **bukan** error
> yang menggagalkan render, karena font kita sudah di-embed langsung dan
> tidak butuh fontconfig untuk dicari. Kalau gambar tetap gagal dibuat,
> penyebabnya ada di error JSON yang dikembalikan endpoint-nya, bukan baris
> warning ini.

Kalau mau ganti font (misalnya ke Impact asli atau font lain):

1. Taruh file `.ttf` baru di `lib/fonts/`.
2. Perbarui `FONT_PATH` di `lib/generate.js` supaya menunjuk ke file itu.
3. Perbarui `outputFileTracingIncludes` di `next.config.js` supaya file
   font ikut ter-bundle ke serverless function-nya.
4. Pastikan lisensi font-nya memang mengizinkan redistribusi (font OFL
   dari Google Fonts semuanya aman dipakai begini).
