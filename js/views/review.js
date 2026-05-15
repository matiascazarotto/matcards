import { el, clear, formatInterval } from '../utils.js';
import { db } from '../db.js';
import { uuid } from '../utils.js';
import { review as srsReview, previewIntervals, QUALITY, initialReview } from '../srs.js';
import { speak, warmupTTS } from '../tts.js';
import { syncToCloud, shouldAutoSync } from '../cloud-sync.js';

export async function renderReview(app) {
  const container = el('div', { class: 'view' });
  app.appendChild(container);

  const decks = (await db.getAll('decks')).filter((d) => d.enabled !== false);
  if (decks.length === 0) {
    container.appendChild(el('div', { class: 'card-hero' },
      el('h2', {}, 'Nenhum deck instalado'),
      el('p', {}, 'Importe um deck para iniciar revisões.'),
      el('a', { href: '#/decks', class: 'btn btn-primary' }, 'Ir para Decks')
    ));
    return;
  }

  const dailyNew = await db.getSetting('dailyNewCards', 20);
  const dailyReviews = await db.getSetting('dailyReviews', 200);

  const enabledDeckIds = new Set(decks.map((d) => d.id));
  const allCards = (await db.getAll('cards')).filter((c) => enabledDeckIds.has(c.deckId));
  const cardMap = new Map(allCards.map((c) => [c.id, c]));
  const allReviews = (await db.getAll('reviews')).filter((r) => cardMap.has(r.cardId));

  const now = Date.now();
  const learningQueue = allReviews.filter((r) => (r.state === 'learning' || r.state === 'lapsed') && r.dueDate <= now);
  const reviewQueue = allReviews.filter((r) => r.state === 'review' && r.dueDate <= now).slice(0, dailyReviews);
  const newQueue = allReviews.filter((r) => r.state === 'new').slice(0, dailyNew);

  const queue = [...learningQueue, ...reviewQueue, ...newQueue];

  if (queue.length === 0) {
    container.appendChild(el('div', { class: 'card-hero' },
      el('h2', {}, 'Nenhum card a revisar'),
      el('p', {}, 'Limite diário atingido ou nenhum card vencido. Aumente o limite em Configurações ou volte amanhã.'),
      el('a', { href: '#/', class: 'btn btn-primary' }, 'Início')
    ));
    return;
  }

  const session = {
    id: uuid(),
    startedAt: Date.now(),
    endedAt: 0,
    cardsReviewed: 0,
    newCards: 0,
    ratings: { again: 0, hard: 0, good: 0, easy: 0 },
    durationMs: 0
  };

  let revealed = false;
  let idx = 0;
  let ttsWarmedUp = false;

  function currentReview() { return queue[idx]; }
  function currentCard() { return cardMap.get(currentReview().cardId); }

  function buildFront() {
    const card = currentCard();
    const r = currentReview();
    const parts = [];

    if (card.type === 'cloze' && card.cloze) {
      const blanked = card.cloze.sentence.replace(/\[([^\]]+)\]/g, '<span class="review-cloze-blank">___</span>');
      parts.push(el('div', { class: 'review-card-front', html: blanked }));
      if (card.front?.hint) parts.push(el('div', { class: 'review-card-hint' }, card.front.hint));
    } else if (card.type === 'listening') {
      parts.push(
        el('button', {
          class: 'review-speak-btn review-speak-btn-large',
          onclick: (e) => { e.stopPropagation(); speak(card.front.audioText || card.front.text); }
        }, '▶')
      );
      parts.push(el('p', { class: 'muted', style: { marginTop: '1rem' } }, 'Tocar áudio'));
    } else if (card.type === 'reverse') {
      parts.push(el('div', { class: 'review-card-front' }, card.back.text));
      if (card.back.notes) parts.push(el('div', { class: 'review-card-hint' }, card.back.notes));
    } else {
      parts.push(el('div', { class: 'review-card-front' }, card.front.text));
      if (card.front.hint) parts.push(el('div', { class: 'review-card-hint' }, card.front.hint));
      parts.push(
        el('button', {
          class: 'review-speak-btn',
          'aria-label': 'Ouvir pronúncia',
          onclick: (e) => { e.stopPropagation(); speak(card.front.audioText || card.front.text); }
        }, '▶')
      );
    }

    if (r.state === 'new' && !ttsWarmedUp && (card.type === 'basic' || card.type === 'listening')) {
      const autoplay = card.front.audioText || card.front.text;
      if (card.type === 'basic') setTimeout(() => speak(autoplay), 200);
    }

    return parts;
  }

  function buildBack() {
    const card = currentCard();
    const parts = [];

    if (card.type === 'cloze' && card.cloze) {
      const filled = card.cloze.sentence.replace(/\[([^\]]+)\]/g, '<span class="review-cloze-fill">$1</span>');
      parts.push(el('div', { class: 'review-card-back', html: filled }));
      if (card.back?.text) parts.push(el('p', { class: 'muted', style: { marginTop: '0.5rem' } }, card.back.text));
    } else if (card.type === 'listening') {
      parts.push(el('div', { class: 'review-card-back' }, card.front.text));
      if (card.back?.text) parts.push(el('p', { class: 'muted', style: { marginTop: '0.5rem' } }, card.back.text));
    } else if (card.type === 'reverse') {
      parts.push(el('div', { class: 'review-card-back' }, card.front.text));
      parts.push(
        el('button', {
          class: 'review-speak-btn',
          onclick: (e) => { e.stopPropagation(); speak(card.front.audioText || card.front.text); }
        }, '▶')
      );
    } else {
      parts.push(el('div', { class: 'review-card-back' }, card.back.text));
    }

    if (card.back?.examples?.length) {
      const examples = el('div', { class: 'examples' });
      card.back.examples.forEach((ex) => {
        examples.appendChild(el('div', { class: 'example-row' },
          el('div', { class: 'example-en' }, ex.en),
          el('div', { class: 'example-pt' }, ex.pt)
        ));
      });
      parts.push(examples);
    }
    if (card.back?.notes) parts.push(el('div', { class: 'notes' }, card.back.notes));

    return parts;
  }

  function render() {
    clear(container);
    if (idx >= queue.length) return finishSession();

    const r = currentReview();
    const previews = previewIntervals(r);

    const cardEl = el('div', {
      class: 'review-card',
      onclick: () => { if (!revealed) reveal(); }
    }, ...(revealed ? buildBack() : buildFront()));

    const ratingsEl = el('div', { class: 'review-rate' },
      el('button', {
        class: 'again',
        onclick: () => rate(QUALITY.AGAIN)
      }, 'Again', el('span', { class: 'interval' }, previews.again)),
      el('button', {
        class: 'hard',
        onclick: () => rate(QUALITY.HARD)
      }, 'Hard', el('span', { class: 'interval' }, previews.hard)),
      el('button', {
        class: 'good',
        onclick: () => rate(QUALITY.GOOD)
      }, 'Good', el('span', { class: 'interval' }, previews.good)),
      el('button', {
        class: 'easy',
        onclick: () => rate(QUALITY.EASY)
      }, 'Easy', el('span', { class: 'interval' }, previews.easy))
    );

    const revealEl = el('button', {
      class: 'review-reveal-btn',
      onclick: () => reveal()
    }, 'Mostrar resposta');

    const stateLabel = { new: 'new', learning: 'learning', lapsed: 'lapsed', review: 'review' }[r.state];

    container.appendChild(el('div', { class: 'review-screen' },
      el('div', { class: 'review-header' },
        el('a', { href: '#/', style: { color: 'var(--text-dim)', textDecoration: 'none' } }, '✕'),
        el('div', { class: 'review-counter' },
          el('span', { title: 'restantes' }, `${queue.length - idx}`),
          el('span', { class: 'muted' }, stateLabel)
        )
      ),
      cardEl,
      revealed ? ratingsEl : revealEl
    ));
  }

  function reveal() {
    if (revealed) return;
    if (!ttsWarmedUp) {
      warmupTTS();
      ttsWarmedUp = true;
    }
    revealed = true;
    render();
  }

  async function rate(quality) {
    const r = currentReview();
    const wasNew = r.state === 'new';
    const updated = srsReview(r, quality);
    await db.put('reviews', updated);

    session.cardsReviewed++;
    if (wasNew) session.newCards++;
    const ratingKey = { 0: 'again', 3: 'hard', 4: 'good', 5: 'easy' }[quality];
    if (ratingKey) session.ratings[ratingKey]++;

    if (quality === QUALITY.AGAIN && (updated.state === 'learning' || updated.state === 'lapsed')) {
      queue.push(updated);
    }

    revealed = false;
    idx++;
    render();
  }

  async function finishSession() {
    session.endedAt = Date.now();
    session.durationMs = session.endedAt - session.startedAt;
    await db.put('sessions', session);

    if (await shouldAutoSync()) {
      syncToCloud().then((r) => {
        if (r.ok) console.log('[sync] ok');
        else if (!r.skipped) console.warn('[sync] failed:', r.error);
      });
    }

    const correct = session.ratings.good + session.ratings.easy;
    const accuracy = session.cardsReviewed ? Math.round((correct / session.cardsReviewed) * 100) : 0;

    clear(container);
    container.appendChild(el('div', { class: 'result-screen' },
      el('h2', {}, 'Sessão concluída'),
      el('div', { class: 'stats-row', style: { width: '100%', maxWidth: '420px' } },
        el('div', { class: 'stat-tile' },
          el('span', { class: 'value' }, String(session.cardsReviewed)),
          el('span', { class: 'label' }, 'cards')
        ),
        el('div', { class: 'stat-tile' },
          el('span', { class: 'value' }, `${accuracy}%`),
          el('span', { class: 'label' }, 'acerto')
        ),
        el('div', { class: 'stat-tile' },
          el('span', { class: 'value' }, `${Math.round(session.durationMs / 1000)}s`),
          el('span', { class: 'label' }, 'tempo')
        )
      ),
      el('p', { class: 'muted', style: { marginTop: '1rem' } },
        `${session.ratings.again} Again · ${session.ratings.hard} Hard · ${session.ratings.good} Good · ${session.ratings.easy} Easy`
      ),
      el('a', { href: '#/', class: 'btn btn-primary btn-large btn-block', style: { maxWidth: '320px', marginTop: '1.5rem' } }, 'Início')
    ));
  }

  document.addEventListener('keydown', handleKey);

  function handleKey(e) {
    if (!container.isConnected) {
      document.removeEventListener('keydown', handleKey);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!revealed) reveal();
      else rate(QUALITY.GOOD);
    } else if (revealed) {
      if (e.key === '1') rate(QUALITY.AGAIN);
      else if (e.key === '2') rate(QUALITY.HARD);
      else if (e.key === '3') rate(QUALITY.GOOD);
      else if (e.key === '4') rate(QUALITY.EASY);
    }
  }

  render();
}
