# Hood Tracker → LP Watcher Dorm

Gunakan worker read-only `hood-lp-watcher`, terpisah dari halaman Next.js
`hood-tracker` dan worker indeks historisnya. API yang dipakai Dorm adalah
`GET /status` pada port `9003`, bukan `/api/pnl` pada web port 3000.

Di folder Hood Tracker pada VPS:

```bash
git pull --ff-only
npm ci
nano .env
```

Isi alamat publik yang memang ingin dipantau dan kunci API acak terpisah:

```dotenv
LP_WATCHER_ENABLED=true
LP_WATCHLIST='[{"address":"PUBLIC_EVM_ADDRESS_1","label":"Wallet 1"},{"address":"PUBLIC_EVM_ADDRESS_2","label":"Wallet 2"}]'
LP_WATCHER_API_KEY=KUNCI_KONEKSI_PRIVAT_MINIMAL_16_KARAKTER
LP_WATCHER_HOST=127.0.0.1
LP_WATCHER_PORT=9003
LP_WATCH_INTERVAL_SECONDS=60
```

Pertahankan konfigurasi RPC/Alchemy yang sudah ada. Ganti placeholder alamat
dengan alamat EVM asli; jangan memasukkan private key atau seed phrase.
Kunci koneksi dapat dibuat dengan `openssl rand -hex 32`.

```bash
pm2 startOrRestart ecosystem.config.cjs --only hood-lp-watcher --update-env
pm2 save
pm2 logs hood-lp-watcher --lines 30 --nostream
```

Worker dijalankan langsung melalui `tsx`; tidak memerlukan build halaman Next.js.
Log awal harus menyebut jumlah wallet dan `Read-only API on port 9003`.
Pemindaian pertama dapat lama jika wallet memiliki banyak NFT posisi lama.
Selama pemindaian belum lengkap, status `warn` dan subtotal belum berarti nol aset.

Di `.env` Dorm pada VPS yang sama:

```dotenv
LPWATCHER_MODE=http
LPWATCHER_URL=http://127.0.0.1:9003
LPWATCHER_API_KEY=KUNCI_YANG_SAMA_DENGAN_LP_WATCHER_API_KEY
LPWATCHER_POLL_MS=5000
```

Perhatikan perbedaan nama: Hood memakai `LP_WATCHER_API_KEY`, Dorm memakai
`LPWATCHER_API_KEY`. Base URL Dorm tidak menyertakan `/status`.

```bash
pm2 restart agent-dorm --update-env
```

Nilai LP mencakup estimasi fee yang belum diklaim. Fee bukan pendapatan seumur
posisi. PnL, IL, dan tanggal pembukaan belum tersedia bila riwayat modal belum
terverifikasi. Tampilan Dorm mempertahankan nilai tidak diketahui, penanda data
tertunda, serta subtotal parsial dari beberapa wallet/protokol.

Port 9003 cukup di loopback untuk dua layanan pada VPS yang sama. Permintaan
HTTP hanya membaca snapshot; tidak memulai scan, mengubah posisi, atau
menandatangani transaksi. Status `LIVE` menunjukkan mode HTTP; periksa juga
status kesehatan dan waktu sinkron di panel.
