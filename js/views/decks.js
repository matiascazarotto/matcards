import { el, clear, icon } from '../utils.js';
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

    container.appendChild(el('header', { class: 'page-title' },
      el('h1', {}, 'Decks')
    ));

    const available = [
      { id: 'deck-a2-builtin', file: 'data/deck-a2.json', name: 'Vocabulário básico', level: 'a2' },
      { id: 'deck-b1-builtin', file: 'data/deck-b1.json', name: 'Phrasal verbs & collocations', level: 'b1' },
      { id: 'deck-b2-builtin', file: 'data/deck-b2.json', name: 'Idioms & vocabulário avançado', level: 'b2' }
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
  }
}
