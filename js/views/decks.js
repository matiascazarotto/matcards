import { el, clear } from '../utils.js';
import { db } from '../db.js';
import { importDeckFromJSON } from '../db.js';

export async function renderDecks(app) {
  const container = el('div', { class: 'view' });
  app.appendChild(container);

  await refresh();

  async function refresh() {
    clear(container);

    const installedDecks = await db.getAll('decks');
    const allCards = await db.getAll('cards');
    const allReviews = await db.getAll('reviews');

    const header = el('header', { class: 'app-header' },
      el('a', { href: '#/', style: { color: 'var(--text-dim)', textDecoration: 'none' } }, '← Início'),
      el('h1', {}, 'Decks')
    );
    container.appendChild(header);

    const available = [
      { id: 'deck-a2-builtin', file: 'data/deck-a2.json', name: 'A2 — Vocabulário básico', level: 'a2' },
      { id: 'deck-b1-builtin', file: 'data/deck-b1.json', name: 'B1 — Phrasal verbs & collocations', level: 'b1' },
      { id: 'deck-b2-builtin', file: 'data/deck-b2.json', name: 'B2 — Idioms & vocabulário avançado', level: 'b2' }
    ];

    container.appendChild(el('h3', { style: { marginTop: '1.5rem' } }, 'Instalados'));

    if (installedDecks.length === 0) {
      container.appendChild(el('p', { class: 'muted' }, 'Nenhum deck instalado.'));
    } else {
      const list = el('div', { class: 'deck-list' });
      installedDecks.forEach((deck) => {
        const cards = allCards.filter((c) => c.deckId === deck.id);
        const reviews = allReviews.filter((r) => cards.some((c) => c.id === r.cardId));
        const learned = reviews.filter((r) => r.state === 'review' || r.state === 'lapsed').length;

        list.appendChild(el('div', { class: 'deck-item' },
          el('div', { class: 'deck-item-info' },
            el('div', { class: 'deck-item-name' }, deck.name),
            el('div', { class: 'deck-item-stats' }, `${learned}/${cards.length} aprendidos${deck.enabled === false ? ' · desativado' : ''}`)
          ),
          el('span', { class: 'deck-item-level' }, deck.level)
        ));
      });
      container.appendChild(list);
    }

    const notInstalled = available.filter((a) => !installedDecks.some((d) => d.id === a.id));

    if (notInstalled.length > 0) {
      container.appendChild(el('h3', { style: { marginTop: '2rem' } }, 'Disponíveis'));
      const list = el('div', { class: 'deck-list' });
      notInstalled.forEach((deck) => {
        list.appendChild(el('div', { class: 'deck-item' },
          el('div', { class: 'deck-item-info' },
            el('div', { class: 'deck-item-name' }, deck.name)
          ),
          el('button', {
            class: 'btn btn-primary',
            onclick: async (e) => {
              e.target.textContent = '...';
              e.target.disabled = true;
              try {
                const resp = await fetch('./' + deck.file);
                const json = await resp.json();
                await importDeckFromJSON(json);
                await refresh();
              } catch (err) {
                alert('Falha ao importar: ' + err.message);
                e.target.textContent = 'Importar';
                e.target.disabled = false;
              }
            }
          }, 'Importar')
        ));
      });
      container.appendChild(list);
    }
  }
}
