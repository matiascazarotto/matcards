import { el, clear, icon } from '../utils.js';
import { db } from '../db.js';
import { importDeckFromJSON } from '../db.js';

let _recommendedCache = null;
async function loadRecommended() {
  if (_recommendedCache) return _recommendedCache;
  try {
    const resp = await fetch('./data/recommended-decks.json');
    _recommendedCache = await resp.json();
  } catch {
    _recommendedCache = { qualityGate: {}, decks: [] };
  }
  return _recommendedCache;
}

function passesGate(snapshot, gate) {
  if (!snapshot) return false;
  return (
    (snapshot.rating ?? 0) >= (gate.minRating ?? 0) &&
    (snapshot.ratingCount ?? 0) >= (gate.minRatingCount ?? 0) &&
    (snapshot.downloads ?? 0) >= (gate.minDownloads ?? 0)
  );
}

export async function renderDecks(app) {
  const container = el('div', { class: 'view' });
  app.appendChild(container);

  let showAllRecommended = false;

  await refresh();

  async function refresh() {
    clear(container);

    const installedDecks = await db.getAll('decks');
    const allCards = await db.getAll('cards');
    const allReviews = await db.getAll('reviews');

    container.appendChild(el('header', { class: 'page-title' },
      el('h1', {}, 'Decks')
    ));

    const available = [
      { id: 'deck-a1-builtin', file: 'data/deck-a1.json', name: 'Fundação absoluta', level: 'a1' },
      { id: 'deck-a2-builtin', file: 'data/deck-a2.json', name: 'Vocabulário básico', level: 'a2' },
      { id: 'deck-b1-builtin', file: 'data/deck-b1.json', name: 'Phrasal verbs & collocations', level: 'b1' },
      { id: 'deck-b2-builtin', file: 'data/deck-b2.json', name: 'Idioms & vocabulário avançado', level: 'b2' },
      { id: 'deck-false-friends-pt-en-builtin', file: 'data/deck-false-friends-pt-en.json', name: 'False friends PT-EN', level: 'b1' }
    ];

    if (installedDecks.length === 0) {
      container.appendChild(el('div', { class: 'card' },
        el('p', { class: 'muted' }, 'Nenhum deck instalado.')
      ));
    } else {
      container.appendChild(el('span', { class: 'list-section-title' }, 'Instalados'));
      const list = el('div', { class: 'list' });
      installedDecks.forEach((deck) => {
        const cards = allCards.filter((c) => c.deckId === deck.id);
        const reviews = allReviews.filter((r) => cards.some((c) => c.id === r.cardId));
        const learned = reviews.filter((r) => r.state === 'review' || r.state === 'lapsed').length;
        const subParts = [`${learned}/${cards.length} aprendidos`];
        if (deck.enabled === false) subParts.push('desativado');

        list.appendChild(el('div', { class: 'row' },
          el('span', { class: 'badge' }, deck.level),
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, deck.name),
            el('div', { class: 'row-sub' }, subParts.join(' · '))
          )
        ));
      });
      container.appendChild(list);
    }

    const notInstalled = available.filter((a) => !installedDecks.some((d) => d.id === a.id));

    if (notInstalled.length > 0) {
      container.appendChild(el('span', { class: 'list-section-title' }, 'Disponíveis'));
      const list = el('div', { class: 'list' });
      notInstalled.forEach((deck) => {
        list.appendChild(el('div', { class: 'row' },
          el('span', { class: 'badge' }, deck.level),
          el('div', { class: 'row-main' },
            el('div', { class: 'row-title' }, deck.name)
          ),
          el('button', {
            class: 'btn',
            style: { minHeight: '36px', padding: '0.5rem 1rem', fontSize: '0.88rem' },
            onclick: async (e) => {
              const btn = e.currentTarget;
              btn.textContent = '...';
              btn.disabled = true;
              try {
                const resp = await fetch('./' + deck.file);
                const json = await resp.json();
                await importDeckFromJSON(json);
                await refresh();
              } catch (err) {
                alert('Falha ao importar: ' + err.message);
                btn.textContent = 'Importar';
                btn.disabled = false;
              }
            }
          }, 'Importar')
        ));
      });
      container.appendChild(list);
    }

    await renderRecommendedSection();
  }

  async function renderRecommendedSection() {
    const reg = await loadRecommended();
    if (!reg.decks || !reg.decks.length) return;

    const gate = reg.qualityGate || {};
    const gated = reg.decks.filter((d) => passesGate(d.snapshot, gate));
    const pending = reg.decks.filter((d) => !d.snapshot);
    const failed = reg.decks.filter((d) => d.snapshot && !passesGate(d.snapshot, gate));

    container.appendChild(el('span', { class: 'list-section-title' }, 'Recomendados AnkiWeb'));

    container.appendChild(el('div', { class: 'card' },
      el('p', { class: 'muted', style: { fontSize: '0.85rem', margin: '0 0 0.5rem 0' } },
        `Decks curados pra trilha de estudo. Download .apkg na AnkiWeb → converter local com `,
        el('code', {}, 'node tools/apkg-to-matcards.js'),
        ` → importar JSON em Settings.`
      ),
      el('p', { class: 'muted', style: { fontSize: '0.8rem', margin: '0' } },
        `Gate de qualidade atual: ≥${gate.minRating}★ · ≥${gate.minRatingCount} ratings · ≥${gate.minDownloads.toLocaleString('pt-BR')} downloads. Editável em `,
        el('code', {}, 'data/recommended-decks.json'),
        '.'
      )
    ));

    const visibleVerified = gated;
    const visiblePending = pending;
    const visibleFailed = showAllRecommended ? failed : [];

    if (visibleVerified.length) {
      const list = el('div', { class: 'list' });
      visibleVerified.forEach((d) => list.appendChild(buildRecommendedRow(d, 'verified')));
      container.appendChild(list);
    }

    if (visiblePending.length) {
      container.appendChild(el('span', { class: 'list-section-title', style: { fontSize: '0.8rem', opacity: '0.7' } },
        'Verificar na AnkiWeb (snapshot pendente)'));
      const list = el('div', { class: 'list' });
      visiblePending.forEach((d) => list.appendChild(buildRecommendedRow(d, 'pending')));
      container.appendChild(list);
    }

    if (visibleFailed.length) {
      container.appendChild(el('span', { class: 'list-section-title', style: { fontSize: '0.8rem', opacity: '0.7' } },
        'Abaixo do gate de qualidade'));
      const list = el('div', { class: 'list' });
      visibleFailed.forEach((d) => list.appendChild(buildRecommendedRow(d, 'failed')));
      container.appendChild(list);
    }

    if (failed.length) {
      container.appendChild(el('div', { class: 'card', style: { marginTop: '0.5rem' } },
        el('button', {
          class: 'btn',
          style: { minHeight: '36px', padding: '0.5rem 1rem', fontSize: '0.88rem', width: '100%' },
          onclick: () => { showAllRecommended = !showAllRecommended; refresh(); }
        }, showAllRecommended ? 'Ocultar abaixo do gate' : `Mostrar todos (incluindo ${failed.length} abaixo do gate)`)
      ));
    }
  }

  function buildRecommendedRow(deck, status) {
    const snap = deck.snapshot;
    const url = (deck.ankiweb && (deck.ankiweb.preferredId
      ? `https://ankiweb.net/shared/info/${deck.ankiweb.preferredId}`
      : deck.ankiweb.searchUrl)) || '#';

    const subParts = [];
    if (snap) {
      subParts.push(`${snap.rating}★ · ${snap.ratingCount} ratings · ${snap.downloads.toLocaleString('pt-BR')} downloads`);
    } else if (deck.estCards) {
      subParts.push(`~${deck.estCards} cards`);
    }
    if (deck.why) subParts.push(deck.why);

    return el('div', { class: 'row' },
      el('span', { class: 'badge' }, deck.level),
      el('div', { class: 'row-main' },
        el('div', { class: 'row-title' }, deck.name),
        el('div', { class: 'row-sub', style: { fontSize: '0.78rem' } }, subParts.join(' · '))
      ),
      el('a', {
        class: 'btn',
        href: url,
        target: '_blank',
        rel: 'noopener',
        style: { minHeight: '36px', padding: '0.5rem 0.85rem', fontSize: '0.85rem', textDecoration: 'none' }
      }, status === 'pending' ? 'Buscar' : 'AnkiWeb')
    );
  }
}
