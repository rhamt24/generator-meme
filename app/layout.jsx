import { Anton, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata = {
  title: "BELUMSIAP.GEN — Generator Meme Otomatis",
  description:
    "Generator gambar meme 'Belum Siap' via URL. Atur teks, ukuran, dan format langsung dari GET request — cocok dipakai di bot atau aplikasi apa saja.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${anton.variable} ${plexMono.variable} ${plexSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
