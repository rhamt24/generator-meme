import Link from "next/link";

export const metadata = {
  title: "404 — Halaman Tidak Ditemukan | UNEXAGEN",
};

export default function NotFound() {
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

      <section className="pasal" style={{ textAlign: "center", padding: "48px 16px" }}>
        <div className="stamp" style={{ margin: "0 auto 20px", position: "static" }} aria-hidden="true">
          404
          <br />
          belum siap
        </div>
        <h2 className="pasal-title" style={{ marginBottom: 8 }}>
          Halaman ini belum siap.
        </h2>
        <p className="tagline" style={{ marginBottom: 24 }}>
          Link yang kamu buka tidak ketemu — mungkin salah ketik, sudah dipindah, atau memang belum ada.
        </p>
        <Link href="/" className="btn">
          balik ke beranda
        </Link>
      </section>

      <footer className="footer">
        <span>bebas dipakai — tempel, embed, atau panggil dari bot kesayanganmu.</span>
        <span>UNEXAGEN</span>
      </footer>
    </main>
  );
}
