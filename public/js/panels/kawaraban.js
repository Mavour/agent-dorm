export function renderKawaraban(body, snap, { t, el }) {
  const { ideas = [] } = snap.metrics;
  body.appendChild(t('h3', 'Draf untuk X'));
  if (!ideas.length) body.appendChild(t('p', 'Belum ada draf.', 'muted'));
  for (const idea of ideas) {
    const card = el('article', 'card');
    card.append(t('strong', idea.title), t('p', idea.draft));
    body.appendChild(card);
  }
}
