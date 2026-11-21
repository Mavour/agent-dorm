import { clockOf, usd } from '../format.js';

export function renderBravonoid(body, snap, { t, el }) {
  const { position, recentActions = [] } = snap.metrics;
  body.appendChild(t('h3', 'Status posisi LP'));
  body.appendChild(t('p', snap.headline, 'card'));
  if (position) {
    const row = el('div', 'row');
    row.append(t('span', 'Modal posisi'), t('span', usd(position.depositUsd), 'mono'));
    body.appendChild(row);
  }

  body.appendChild(t('h3', 'Riwayat buka dan tutup'));
  if (!recentActions.length) body.appendChild(t('p', 'Belum ada riwayat posisi.', 'muted'));
  for (const action of recentActions) {
    const row = el('div', 'row');
    row.append(t('span', action.message), t('time', clockOf(action.ts), 'muted mono'));
    body.appendChild(row);
  }
}
