# Agent Dorm — Room 01

Dashboard real-time yang memvisualisasikan koleksi bot trading/keuangan sebagai
karakter samurai pixel-art yang tinggal di satu ruangan. Karakter berjalan-jalan,
menampilkan bubble ucapan dan ikon saat ada kejadian, dan membuka popup berisi
status + data bot saat diklik. Karakter "bos" (kamu) duduk di tengah ruangan dan
bereaksi seperti bos sungguhan.

Fase ini berjalan **sepenuhnya dengan data dummy**: `npm install && npm start`
langsung memberikan situs hidup di http://127.0.0.1:8765 tanpa API key, tanpa
panggilan LLM, dan tanpa bot asli.

## Mulai cepat

```bash
npm install
npm start
# buka http://127.0.0.1:8765
```

Perintah lain:

```bash
npm run dev              # jalan dengan node --watch (auto-reload)
npm test                 # 21 tes kontrak + dummy + advisor + deriver + adapter
npm run export:examples  # tulis examples/status-<agent>.json dari snapshot dummy
npm run smoke            # smoke test websocket (server harus sudah jalan)
```

Tambahkan `?debug=1` di URL untuk overlay FPS + status agen.
Tekan `D` atau klik tombol `DEMO` untuk panel demo (hanya bila `DEMO_CONTROLS=true`).

## Sketsa arsitektur

```
bot asli (nanti) ──HTTP GET /status / file JSON──┐
                                                 ▼
                        ┌─────────────────────────────────┐
                        │ adapter per agen (dummy|http|file)│ push snapshot+event
                        └───────────────┬─────────────────┘
                                        ▼
                        ┌─────────────────────────────────┐
                        │ store (snapshot + ring event 200) │──▶ boss-reactions
                        └───────────────┬─────────────────┘
                                        ▼
                    REST /api/*  +  WebSocket /ws (server → client)
                                        ▼
                        frontend vanilla (stage, agen, bos, popup, HUD)
```

- **Adapter** mendorong data; store menggabungkan. Frontend tidak berubah saat
  bot diganti dari dummy ke asli.
- **Karo advisor** berjalan di sisi dashboard dari snapshot portfolio
  (bot portfolio tetap murni data). Mode `llm` memakai OpenRouter untuk pertanyaan
  pengguna; kartu saran dan rapor otomatis tetap dihitung lokal tanpa kuota API.
- Dashboard **read-only** terhadap bot: satu-satunya POST adalah
  `/api/portfolio/ask` (tanya-jawab Karō) dan `/api/demo/trigger`
  (khusus dummy).

## Tabel environment

| Key | Default | Arti |
|---|---|---|
| `PORT` / `HOST` | `8765` / `127.0.0.1` | Alamat listen |
| `LOG_LEVEL` | `info` | Level log |
| `ASSETS_DIR` | `./assets_ready` | Folder aset pixel-art |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | kosong | Akun halaman login Dorm; melindungi dashboard/API/WS |
| `STALE_AFTER_SEC` | `120` | Data lebih tua dari ini dianggap basi (warn) |
| `DEMO_CONTROLS` | `true` | Panel demo + `POST /api/demo/trigger` |
| `DEMO_SEED` | `42` | Seed PRNG dummy (reproducible) |
| `DEMO_SPEED` | `1` | Pengali kecepatan skenario dummy |
| `EXITBOT_MODE` / `LPWATCHER_MODE` / `ALERT_MODE` / `PORTFOLIO_MODE` | `dummy` | `dummy` \| `http` \| `file` |
| `<AGENT>_URL` | kosong | Base URL bot (`GET <URL>/status`) |
| `<AGENT>_FILE` | kosong | Path file JSON bot (mode file) |
| `<AGENT>_API_KEY` | kosong | Dikirim sebagai `Authorization: Bearer` (kalau diisi) |
| `<AGENT>_POLL_MS` | `5000` | Interval poll http/file |
| `ADVISOR_MODE` | `rules` | `llm` untuk chat OpenRouter; `rules` untuk jawaban lokal |
| `OPENROUTER_API_KEY` | kosong | Key privat di `.env` server; tanpa key memakai rules |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3.5-lightning:free` | Model gratis utama; cadangan `openrouter/free` |
| `ADVISOR_MAX_TOKENS` | `1536` | Batas token reasoning + jawaban AI (maksimal 2048) |

`.env` opsional dan **tidak pernah** menimpa environment variable asli.

Untuk mengaktifkan chat Karō, isi di `.env` (jangan commit key):

```dotenv
ADVISOR_MODE=llm
OPENROUTER_API_KEY=<key-openrouter-kamu>
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free
```

Restart server (`npm start`, atau `pm2 restart agent-dorm --update-env` untuk
layanan PM2). Tab Saran menampilkan kolom pertanyaan bebas setelah key tersedia.
Hanya angka agregat aset, arus kas, budget, alokasi, pengeluaran per kategori, dan pertanyaan pengguna
dikirim ke OpenRouter; alamat wallet, label akun, catatan, dan daftar transaksi
tidak disertakan. Jawaban AI tidak dijamin benar; cek kembali dengan angka Fintrack.
Kartu saran dan rapor tidak memanggil API. Pertanyaan identik pada snapshot dan konteks obrolan sama
di-cache 5 menit. Jika API gagal/kuota habis, jawaban kembali ke rules dengan label
yang jelas. Timeout/respons tidak lengkap mencoba `openrouter/free` sekali lagi,
dengan batas 30 detik per percobaan, tanpa memaksa pertanyaan berikutnya ke rules.
Hanya penolakan autentikasi/akses/kuota yang menjeda panggilan selama 30 detik.
Status koneksi dan penyebab kegagalan ditampilkan di tab Saran. Tidak ada
pengalihan ke model berbayar.

Karō juga membuat **yapping proaktif** sesuai peran bendahara Dorm, maksimal satu
percobaan tiap 2 jam (sekitar 12/hari). Jadwal ini bertahan melewati restart dan
melewati snapshot offline/error atau lebih tua dari 2 menit. Yapping tidak memakai
teks rules sebagai pengganti AI. Bila provider gagal, ia menunggu jadwal berikutnya.
Yapping baru juga tampil sebagai cuplikan bubble di karakter Karō; teks lengkapnya
tersimpan pada riwayat di tab Saran.
Tab **Saran** menampilkan gelembung berlabel **Yapping Karo**, **Pertanyaan kamu**,
dan **Jawaban pertanyaan**, beserta waktu dan sumber AI/aturan otomatis.
Riwayat baru tersimpan di `.data/karo-chat.json`, maksimal 500 pesan, dibagikan
antarperangkat pada akun Dorm yang sama, dan tetap ada setelah restart. Simpan
folder `.data` pada volume persisten ketika deploy. Riwayat sebelum fitur ini
diaktifkan tidak dapat dipulihkan. Enam pesan terakhir yang berhasil (maksimal
2000 karakter per pesan) disertakan sebagai konteks LLM saat menjawab atau yapping.
Jawaban cadangan dan pertanyaan terkait tetap terlihat di riwayat, tetapi tidak
diteruskan kembali ke LLM.

## Ganti satu bot dari dummy ke asli, langkah demi langkah

Contoh: ExitBot asli yang melayani `GET http://192.168.1.10:9000/status`:

1. Pastikan bot mengembalikan envelope persis seperti
   `docs/BOT_API_CONTRACT.md` (uji dengan `curl`, lihat contoh
   `examples/status-exitbot.json`).
2. Salin `.env.example` ke `.env`, isi:
   ```
   EXITBOT_MODE=http
   EXITBOT_URL=http://192.168.1.10:9000
   EXITBOT_API_KEY=<kunci-kalau-ada>
   ```
3. Restart (`npm start` atau `pm2 restart agent-dorm`). Tabel mode saat boot
   harus menunjukkan `exitbot: mode=http`.
4. Buka dashboard: chip popup ExitBot berubah dari `DUMMY` menjadi `LIVE`.
   Bot lain tetap dummy (mode campuran didukung).

Untuk bot tanpa server HTTP, tulis JSON ke file lalu pakai
`EXITBOT_MODE=file` + `EXITBOT_FILE=/path/status.json` (poll tiap
`EXITBOT_POLL_MS`; file hilang = offline).

Aturan adapter http/file: timeout 4 dtk, backoff eksponensial maks 60 dtk,
offline setelah 3 gagal berurutan (metrik terakhir dipertahankan), event
`agent_offline`/`agent_online`, data basi (`updatedAt` > `STALE_AFTER_SEC`)
menjadi `warn` + alert "Data basi". Poll pertama tidak memicu bubble histori.

## Login dan deploy dengan PM2 + SSH tunnel / nginx

Isi `BASIC_AUTH_USER` dan `BASIC_AUTH_PASS` untuk mengaktifkan halaman login
Dorm. Pilihan **Ingat perangkat ini** aktif secara default: cookie HttpOnly
berlaku 30 hari dan tetap tersedia setelah browser atau server ditutup. Tanpa
pilihan ini, sesi berlaku maksimal 8 jam dengan cookie sesi browser.
Tombol **Keluar** mencabut sesi dan koneksi realtime. Perubahan akun mencabut
sesi lama. Simpan folder `.data/` pada volume persisten saat deploy; isinya
hash sesi, bukan password atau token mentah. Gunakan HTTPS di reverse proxy.

Untuk data Karō asli, lihat [panduan Fintrack lokal](docs/FINTRACK_LOCAL.md).

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

- **Opsi aman termudah (tanpa buka port):** dari laptop,
  `ssh -L 8765:127.0.0.1:8765 user@server`, lalu buka
  `http://127.0.0.1:8765`.
- **Opsi nginx + login Dorm:** set di `.env`
  `BASIC_AUTH_USER` + `BASIC_AUTH_PASS`, lalu reverse-proxy ke
  `127.0.0.1:8765` (teruskan header `Host`, `X-Forwarded-Proto`, cookie,
  dan upgrade websocket untuk `/ws`). Matikan `auth_basic` lama pada reverse
  proxy jika ingin memakai halaman login Dorm tanpa dialog login tambahan.
- Kalau `HOST` bukan loopback dan akun kosong, server mencetak
  peringatan keras saat boot.

## Catatan keamanan

- Listen default `127.0.0.1`. Sesi login melindungi dashboard, API, dan WS;
  hanya halaman login dan aset yang diperlukan login dapat diakses publik.
- Header: `Content-Security-Policy` ketat (self saja), `nosniff`, `no-referrer`.
- Kunci API tidak pernah di-log/di-return; header Authorization disensor;
  `/api/state` tidak membeberkan URL/file path.
- Semua teks turunan data di-render via `textContent` (tanpa `innerHTML`).
- Batas memori: ring event 200, transaksi 60, kandidat 12.
- Graceful shutdown via SIGINT/SIGTERM; error handler me-return `{error}`
  tanpa stack trace.

## Asumsi

1. Port dan host default (`127.0.0.1:8765`) sesuai spek; tidak ada TLS lokal.
2. `?debug=1`, tombol `D`, dan panel demo cukup untuk kebutuhan demo
   (tidak ada halaman admin terpisah).
3. Reaksi bos idle (30–60 dtk) di sisi server juga di-broadcast lewat pesan
   `boss` yang sama seperti reaksi event.
4. File mode membaca seluruh file JSON tiap poll (cocok untuk file kecil).
5. Versi runtime `@fastify/*` mengikuti major terbaru yang kompatibel dengan
   Fastify 5 (daftar dep tetap: fastify + 3 plugin fastify).
