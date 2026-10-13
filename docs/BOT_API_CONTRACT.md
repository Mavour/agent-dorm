# Kontrak API Bot (BOT_API_CONTRACT.md)

Dokumen ini cukup untuk mengimplementasikan bot asli dari nol. Dashboard
**hanya membaca** — tidak ada endpoint yang bisa menyuruh bot jual/beli/close.

## 1. Cara bot melayani data

**Mode HTTP (disarankan):** bot menjalankan server HTTP dan menjawab:

```
GET <BASE_URL>/status
Authorization: Bearer <API_KEY>   # hanya kalau bot butuh kunci
```

- Response: `200 OK` + JSON envelope (bagian 2).
- Dashboard poll tiap `<AGENT>_POLL_MS` (default 5 dtk), timeout 4 dtk.
- 3 gagal berurutan → dashboard menandai agen **offline** (metrik terakhir
  tetap ditampilkan) + event `agent_offline`; pulih → `agent_online`.

**Mode file (bot tanpa server HTTP):** bot menulis JSON envelope ke file,
config dashboard: `<AGENT>_MODE=file`, `<AGENT>_FILE=/path/status.json`.
Aturan offline/stale sama. File hilang/rusak = offline.

**Aturan umum:**

- `Content-Type: application/json`.
- `updatedAt` = waktu ISO-8601 saat snapshot dibuat. Kalau lebih tua dari
  `STALE_AFTER_SEC` (default 120 dtk), dashboard menandai `warn` + "Data basi".
- Uang dalam **USD** (float, 2 desimal cukup). Persen dalam **persen**
  (mis. `8` = 8%). Waktu dalam **ISO-8601 UTC**.
- Array opsional `events` boleh diisi bot; dashboard meneruskan item baru
  (by `id`) menjadi event global. Boleh juga dikosongkan — dashboard
  menurunkan event sendiri dari diff snapshot.

## 2. Envelope (wajib sama untuk semua bot)

```json
{
  "agentId": "exitbot | portfolio | alert | lpwatcher",
  "status": "ok | warn | error | offline",
  "updatedAt": "2026-10-13T08:00:00.000Z",
  "headline": "teks pendek, maks 80 karakter",
  "metrics": { "... lihat per bot di bawah ..." },
  "alerts": [
    { "id": "string-stabil", "level": "info|warn|critical", "message": "...", "ts": "ISO-8601" }
  ],
  "events": [
    { "id": "string-unik", "ts": "ISO-8601", "type": "coin_found|position_out_of_range|position_back_in_range|position_closed|report_ready|agent_offline|agent_online|info", "level": "info|warn|critical", "message": "...", "data": {} }
  ]
}
```

- `alerts`: kondisi yang masih terbuka. `id` stabil (mis. `oor-WIF/SOL`)
  supaya dashboard bisa diff; hapus dari array kalau sudah pulih.
- `events`: riwayat kejadian (opsional). `id` unik per kejadian.
- Validator: `server/contract.js` (`validateSnapshot`). Snapshot dummy
  selalu lolos validator (diuji di `test/contract.test.js`).

## 3. Metrics per bot (nama field harus persis)

### 3a. exitbot — penutup otomatis posisi LP Solana

```json
"metrics": {
  "mode": "armed | paused",
  "monitoredPositions": 6,
  "closedToday": 9,
  "closedProfitToday": 6,
  "closedLossToday": 3,
  "realizedPnlTodayUsd": 141.7,
  "rules": { "stopLossPct": 8, "takeProfitPct": 15, "maxSlippageBps": 80, "closeAfterOutOfRangeMin": 10 },
  "pending": [{ "pair": "POPCAT/SOL", "reason": "out_of_range", "etaSec": 30 }],
  "recentExecutions": [
    { "id": "ex-1", "ts": "ISO", "pair": "POPCAT/SOL", "reason": "take_profit|stop_loss|out_of_range|manual", "pnlUsd": 41.2, "txSig": "base58..." }
  ]
}
```

- `pending.reason` bebas string pendek; `recentExecutions.reason` salah satu
  dari 4 enum di atas. Maks 10 item, terbaru dulu.
- `stopLossPct`/`takeProfitPct` dalam persen; `maxSlippageBps` basis poin.

### 3b. lpwatcher — pemantau wallet LP

```json
"metrics": {
  "wallet": "Robinhood Wallet",
  "totals": { "valueUsd": 10260, "feesEarnedUsd": 126.3, "unrealizedPnlUsd": 109.6, "positionsInRange": 4, "positionsOutOfRange": 1 },
  "positions": [
    { "id": "lp-sol", "pair": "SOL/USDC", "protocol": "Orca", "rangeLow": 138, "rangeHigh": 162, "price": 151.2, "inRange": true, "valueUsd": 4820, "feesEarnedUsd": 61.2, "unrealizedPnlUsd": 84.5, "ilPct": -0.4, "openedAt": "ISO" }
  ]
}
```

- Harga dalam unit quote (mis. USDC) kecuali pair `X/SOL` (dalam SOL).
- `ilPct` = impermanent loss persen (negatif = rugi).

### 3c. alert — pemindai koin LP

```json
"metrics": {
  "lastScanAt": "ISO",
  "scannedToday": 128,
  "passedFilters": 5,
  "filters": { "minLiquidityUsd": 50000, "minVolume24hUsd": 100000, "maxFdvUsd": 5000000, "minAgeHours": 6 },
  "candidates": [
    { "id": "cand-NEKOZ-1", "symbol": "NEKOZ", "pair": "NEKOZ/USDC", "mint": "mint...", "ageHours": 12.5, "priceUsd": 0.42, "liquidityUsd": 200000, "volume24hUsd": 500000, "fdvUsd": 2000000, "estFeeAprPct": 64.5, "score": 84, "reasons": ["Volume naik 3x"], "riskFlags": ["Likuiditas tipis"], "foundAt": "ISO", "url": "" }
  ]
}
```

- `candidates` urut `score` desc, maks 12. `score` 0–100.

### 3d. portfolio — data Karo (murni data; nasihat dibuat dashboard)

```json
"metrics": {
  "currency": "USD",
  "netWorthUsd": 12480,
  "accounts": [{ "id": "acc-stable", "label": "Stablecoin Wallet", "type": "stable|lp|spot|cash", "valueUsd": 3200 }],
  "cashflow": { "todayIncomeUsd": 5, "todayExpenseUsd": 2.74, "last7dIncomeUsd": 100, "last7dExpenseUsd": 50.4, "last30dIncomeUsd": 400, "last30dExpenseUsd": 220 },
  "budget": { "dailyUsd": 9, "monthlyUsd": 270, "monthSpentUsd": 100 },
  "transactions": [
    { "id": "tx-1", "ts": "ISO", "kind": "income|expense", "category": "Makan", "amountUsd": 1.85, "note": "Sarapan" }
  ]
}
```

- `transactions` terbaru dulu, maks 60. `amountUsd` selalu positif
  (arah dari `kind`).

## 4. Uji dengan curl

```bash
# 1. Bot lokal menjawab envelope valid:
curl -s http://127.0.0.1:9000/status | head -c 500

# 2. Validasi cepat field wajib dengan node:
curl -s http://127.0.0.1:9000/status | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const j=JSON.parse(s);
  for(const k of ['agentId','status','updatedAt','headline','metrics','alerts'])
    if(!(k in j)) throw new Error('hilang: '+k);
  console.log('OK', j.agentId, j.status);
});"

# 3. Dengan API key:
curl -s -H "Authorization: Bearer $EXITBOT_API_KEY" http://127.0.0.1:9000/status | head -c 300
```

Contoh lengkap siap salin: `examples/status-<agent>.json`
(dihasilkan via `npm run export:examples` dari snapshot dummy yang valid).
