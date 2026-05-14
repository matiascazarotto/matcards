import { dayKey } from './utils.js';

const DAY_MS = 86_400_000;

export async function getStreak(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)));
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (days.has(dayKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export async function getRetention(sessions, days = 30) {
  if (!sessions || sessions.length === 0) return 0;
  const cutoff = Date.now() - days * DAY_MS;
  const recent = sessions.filter((s) => s.startedAt >= cutoff);
  if (recent.length === 0) return 0;
  let total = 0;
  let correct = 0;
  recent.forEach((s) => {
    if (!s.ratings) return;
    total += s.cardsReviewed;
    correct += (s.ratings.good || 0) + (s.ratings.easy || 0);
  });
  return total > 0 ? (correct / total) * 100 : 0;
}

export async function getHeatmapData(sessions, days = 98) {
  const buckets = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(dayKey(d.getTime()), { date: d.toLocaleDateString('pt-BR'), count: 0 });
  }

  (sessions || []).forEach((s) => {
    const key = dayKey(s.startedAt);
    if (buckets.has(key)) buckets.get(key).count += s.cardsReviewed || 0;
  });

  return Array.from(buckets.values());
}

export async function getUpcomingDue(reviews, days = 14) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    buckets.push({
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      ts: d.getTime(),
      count: 0
    });
  }

  (reviews || []).forEach((r) => {
    if (r.state === 'new') return;
    const due = r.dueDate;
    for (let i = 0; i < buckets.length; i++) {
      const start = buckets[i].ts;
      const end = start + DAY_MS;
      if (due >= start && due < end) {
        buckets[i].count++;
        break;
      }
      if (due < buckets[0].ts) {
        buckets[0].count++;
        break;
      }
    }
  });

  return buckets;
}
