# BELUMSIAP.GEN

Generator meme "Belum Siap" — foto dasarnya tetap (gambar 5 orang duduk pakai jas),
teks di atasnya bisa diganti-ganti lewat parameter URL. Ada halaman web untuk
coba-coba langsung, dan ada endpoint `GET` yang bisa dipanggil dari bot, chat,
atau aplikasi apa pun.

## Menjalankan di lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

> Kalau develop lewat Termux dan `sharp` gagal ke-install (butuh binary native),
> jalankan `npm install --platform=linux --arch=x64 sharp` atau install di mesin
> lain lalu commit `package-lock.json`-nya — saat build di Vercel, `sharp` akan
> otomatis ambil binary yang sesuai untuk server Vercel (Linux x64), jadi tidak
> masalah kalau di HP/Termux beda arsitektur.

## Deploy ke Vercel

1. Push folder ini ke repo GitHub baru.
2. Import repo tersebut di [vercel.com/new](https://vercel.com/new).
3. Framework preset otomatis terdeteksi sebagai **Next.js** — tidak perlu ubah
   apa-apa, langsung klik **Deploy**.
4. Setelah selesai, endpoint gambar bisa diakses di:
   `https://<domain-kamu>.vercel.app/api/meme?text=BELUM+SIAP`

## Struktur penting

- `public/base.jpg` — foto dasar (template meme). Ganti file ini kalau mau pakai
  foto lain, ukuran/rasio bebas karena akan di-crop otomatis sesuai `width`/`height`.
- `lib/generate.js` — logika render teks + gambar (pakai `sharp`) dan render GIF
  animasi stempel (pakai `gifenc`, murni JavaScript, tidak butuh binary tambahan
  di luar `sharp`).
- `app/api/meme/route.js` — endpoint `GET` publik.
- `app/page.jsx` — halaman UI: form, live preview, dokumentasi parameter.

## Parameter endpoint `GET /api/meme`

| Parameter | Default      | Keterangan                                              |
| --------- | ------------ | -------------------------------------------------------- |
| `text`    | `BELUM SIAP` | Teks di bagian atas gambar                                |
| `text2`   | *(kosong)*   | Teks tambahan di bagian bawah, opsional                   |
| `width`   | `720`        | Lebar hasil (px), 100–1600                                |
| `height`  | `720`        | Tinggi hasil (px), 100–1600                                |
| `format`  | `png`        | `png` / `jpg` / `webp` / `gif`                             |
| `color`   | `ffffff`     | Warna teks, hex tanpa `#`                                  |
| `stroke`  | `000000`     | Warna outline teks, hex tanpa `#`                          |

Contoh:

```
/api/meme?text=DEADLINE+BESOK&text2=TAPI+BELUM+MULAI&format=gif&width=500&height=500
```

## Kalau mau ganti font meme

Saat ini teks pakai font sans bold bawaan sistem (`Arial Black` / fallback bold
sans-serif) supaya tidak bergantung pada font pihak ketiga di server. Kalau mau
persis Impact, taruh file `.ttf` di `public/fonts/`, lalu daftarkan lewat
`fontconfig` sebelum build atau embed via `sharp`'s SVG renderer — ada beberapa
cara, tanya lagi kalau butuh dibantu setup-nya.
