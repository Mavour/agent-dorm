function createPreview(id, headline, metrics) {
  return {
    id,
    mode: 'dummy',
    start(ctx) {
      ctx.publishSnapshot(id, {
        agentId: id,
        status: 'ok',
        updatedAt: new Date().toISOString(),
        headline,
        metrics,
        alerts: [],
        events: [],
      });
    },
    stop() {},
  };
}

export function createBravonoidDummy() {
  const now = Date.now();
  const openedAt = new Date(now - 15 * 60000).toISOString();
  const closedAt = new Date(now - 45 * 60000).toISOString();
  return createPreview('bravonoid', 'SOL/USDC · Terbuka', {
    position: { pair: 'SOL/USDC', depositUsd: 250, openedAt },
    recentActions: [
      { ts: openedAt, message: 'Buka posisi SOL/USDC' },
      { ts: closedAt, message: 'Tutup posisi SOL/USDC' },
    ],
  });
}

export function createKawarabanDummy() {
  return createPreview('kawaraban', '2 ide konten X siap ditinjau', {
    ideas: [
      {
        title: 'Edukasi · LP keluar range',
        draft: 'Apa yang terjadi saat posisi LP keluar dari range? Yuk bahas perubahan komposisi aset dan kapan posisi itu mulai menerima fee lagi.',
      },
      {
        title: 'Build in public · Kenalan dengan Agent Dorm',
        draft: 'Lagi bikin dashboard tempat agent tampil sebagai karakter. Ada yang memantau LP, ada yang menyiapkan ide konten. Kalau kamu punya satu agent tambahan, tugasnya apa?',
      },
    ],
  });
}
