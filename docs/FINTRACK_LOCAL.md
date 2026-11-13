# Fintrack lokal ke Karō

Koneksi membaca snapshot database Fintrack melalui API khusus `/status`. Tidak
menjalankan migrasi, sinkronisasi provider, atau transaksi pada database Fintrack.
Fintrack harus sudah memiliki hasil build `dist/server/dormApi.js` dan database.
Script lokal ini memakai Node.js 22.6 atau lebih baru (`node:util.parseEnv`).

Di `.env` Dorm, isi:

```dotenv
PORTFOLIO_MODE=http
PORTFOLIO_URL=http://127.0.0.1:9002
PORTFOLIO_API_KEY=<kunci-acak-privat>
PORTFOLIO_POLL_MS=5000
```

Jalankan dua terminal dari folder Dorm:

```powershell
node scripts/fintrack-local.js 'C:\Users\ASUS\OneDrive\Documents\fintrack'
```

```powershell
npm start
```

Buka `http://127.0.0.1:8765`. Karō memakai data asli; agen lain mengikuti
konfigurasi masing-masing. API bridge hanya listen pada loopback dan wajib
Bearer key dari `.env` Dorm. Key tidak dikirim ke browser.

API memperbarui snapshot setiap 30 detik. Data tersimpan yang lama, sinkronisasi
gagal, kurs tidak tersedia, valuasi tidak lengkap, dan budget belum diatur tetap
ditampilkan sebagai peringatan. Karō mengutamakan nilai `metrics.native` dalam
rupiah untuk total/subtotal aset, arus kas, budget, transaksi, saran, dan rapor.
Nilai asli tidak dikonversi lagi oleh Dorm. USD pada transaksi hanya menjadi
angka pendamping jika Fintrack mengirimkannya. Rincian alokasi aset yang hanya
dikirim dalam USD tetap berlabel USD. Sumber lama tanpa `native` tetap memakai USD.
Nilai yang tidak diketahui tampil `-` atau “belum tersedia”; Karō tidak menghitung
persentase LP dari total yang belum lengkap. Ringkasan dan transaksi mengikuti
snapshot baru saat panel terbuka tanpa menghapus tab aktif atau percakapan.

Budget bulanan menggunakan `STATUS_API_MONTHLY_BUDGET_IDR` pada `.env` Fintrack.
Biarkan kosong jika belum ditentukan; bridge tidak menebak anggaran. Mengubah
opsi bridge atau hasil build Fintrack memerlukan restart bridge.

Untuk VPS, gunakan API bawaan proses Fintrack dengan `STATUS_API_ENABLED=true`,
`STATUS_API_KEY` sama dengan `PORTFOLIO_API_KEY`, dan `PORTFOLIO_URL` yang dapat
dijangkau dari server Dorm. Bridge lokal ini bukan layanan VPS dan berhenti saat
proses terminal dihentikan.
