import { el, clear } from '../utils.js';
import { db } from '../db.js';
import { getStreak, getRetention, getHeatmapData, getUpcomingDue } from '../stats.js';

export async function renderStats(app) {
  const container = el('div', { class: 'view' });
  app.appendChild(container);

  const sessions = await db.getAll('sessions');
  const reviews = await db.getAll('reviews');

  const streak = await getStreak(sessions);
  const retention = await getRetention(sessions, 30);
  const heatmap = await getHeatmapData(sessions, 98);
  const upcoming = await getUpcomingDue(reviews, 14);

  const totalReviews = sessions.reduce((sum, s) => sum + s.cardsReviewed, 0);
  const totalTimeMin = Math.round(sessions.reduce((sum, s) => sum + (s.durationMs || 0), 0) / 60_000);

  const stateCounts = { new: 0, learning: 0, review: 0, lapsed: 0 };
  reviews.forEach((r) => { stateCounts[r.state] = (stateCounts[r.state] || 0) + 1; });

  container.appendChild(el('header', { class: 'page-title' },
    el('h1', {}, 'Estatísticas')
  ));

  container.appendChild(el('div', { class: 'metrics' },
    el('div', { class: 'metric' },
      el('span', { class: 'num mono accent' }, String(streak)),
      el('span', { class: 'label' }, streak === 1 ? 'dia seguido' : 'dias seguidos')
    ),
    el('div', { class: 'metric' },
      el('span', { class: 'num mono' }, `${Math.round(retention)}%`),
      el('span', { class: 'label' }, 'retenção 30d')
    ),
    el('div', { class: 'metric' },
      el('span', { class: 'num mono' }, String(totalReviews)),
      el('span', { class: 'label' }, 'reviews totais')
    )
  ));

  container.appendChild(el('div', { class: 'settings-section' },
    el('h3', {}, 'Atividade — últimos 98 dias'),
    el('div', { style: { padding: '0 1rem 1rem' } },
      buildHeatmap(heatmap),
      el('p', { class: 'muted', style: { marginTop: '0.5rem', padding: 0, fontSize: '0.85rem' } }, `Total estudado: ${totalTimeMin} min`)
    )
  ));

  container.appendChild(el('div', { class: 'settings-section' },
    el('h3', {}, 'Distribuição de cards'),
    el('div', { class: 'settings-row' },
      el('label', {}, 'new'),
      el('span', { class: 'mono' }, String(stateCounts.new))
    ),
    el('div', { class: 'settings-row' },
      el('label', {}, 'learning'),
      el('span', { class: 'mono' }, String(stateCounts.learning + stateCounts.lapsed))
    ),
    el('div', { class: 'settings-row' },
      el('label', {}, 'review'),
      el('span', { class: 'mono' }, String(stateCounts.review))
    )
  ));

  container.appendChild(el('div', { class: 'settings-section' },
    el('h3', {}, 'Próximas revisões — 14 dias'),
    el('div', { style: { padding: '0 1rem 1rem' } }, buildUpcoming(upcoming))
  ));
}

function buildHeatmap(data) {
  const wrapper = el('div', { class: 'heatmap' });
  data.forEach((d) => {
    let level = 0;
    if (d.count > 0) level = 1;
    if (d.count >= 10) level = 2;
    if (d.count >= 30) level = 3;
    if (d.count >= 60) level = 4;
    wrapper.appendChild(el('div', {
      class: `heatmap-cell ${level ? 'l' + level : ''}`,
      title: `${d.date}: ${d.count} reviews`
    }));
  });
  return wrapper;
}

function buildUpcoming(upcoming) {
  const max = Math.max(1, ...upcoming.map((u) => u.count));
  const wrapper = el('div', { class: 'upcoming-chart' });
  upcoming.forEach((u) => {
    const h = (u.count / max) * 100;
    wrapper.appendChild(el('div', {
      class: u.count > 0 ? 'upcoming-bar' : 'upcoming-bar empty',
      style: { height: `${Math.max(h, 4)}%` },
      title: `${u.date}: ${u.count} devidos`
    }));
  });
  return wrapper;
}
