import { el, clear, icon } from '../utils.js';
import { db } from '../db.js';
import { importDeckFromJSON } from '../db.js';
import { parseApkg } from '../apkg-import.js';

const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'];

export async function renderDecks(app) {
  const container = el('div', { class: 'view' });
  app.appendChild(container);

  let apkgLevel = 'b1';
  let apkgStatus = '';

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

    renderApkgImportSection();
  }

  function renderApkgImportSection() {
    container.appendChild(el('span', { class: 'list-section-title' }, 'Importar deck Anki (.apkg)'));

    container.appendChild(el('div', { class: 'card' },
      el('p', { class: 'muted', style: { fontSize: '0.85rem', margin: '0 0 0.75rem 0' } },
        'Baixe um deck Anki (.apkg) da AnkiWeb ou de outra fonte e importe aqui. O converter roda localmente no app — nada sai do seu device.'
      ),
      el('div', { class: 'row', style: { gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' } },
        el('span', { style: { fontSize: '0.85rem', opacity: '0.8' } }, 'Nível CEFR:'),
        ...LEVELS.map((lv) => el('button', {
          class: lv === apkgLevel ? 'btn btn-primary' : 'btn',
          style: { minHeight: '32px', padding: '0.3rem 0.7rem', fontSize: '0.8rem' },
          onclick: () => { apkgLevel = lv; refresh(); }
        }, lv.toUpperCase()))
      ),
      el('label', {
        class: 'btn btn-primary',
        style: { display: 'inline-block', minHeight: '40px', padding: '0.6rem 1.2rem', fontSize: '0.9rem', cursor: 'pointer' }
      },
        'Escolher arquivo .apkg',
        el('input', {
          type: 'file', accept: '.apkg,application/zip', style: { display: 'none' },
          onchange: async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            apkgStatus = `Convertendo "${file.name}"... (libs ~800KB no primeiro uso)`;
            refresh();
            try {
              const deckJson = await parseApkg(file, { level: apkgLevel });
              if (!deckJson.cards.length) throw new Error('Nenhum card encontrado no .apkg');
              await importDeckFromJSON(deckJson);
              apkgStatus = `✓ "${deckJson.name}" importado — ${deckJson.cards.length} cards.`;
              await refresh();
            } catch (err) {
              apkgStatus = `Falha: ${err.message}`;
              refresh();
            }
          }
        })
      ),
      apkgStatus ? el('p', { class: 'muted', style: { fontSize: '0.82rem', margin: '0.75rem 0 0 0' } }, apkgStatus) : null
    ));
  }
}
