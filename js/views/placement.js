import { el, clear, shuffle, icon } from '../utils.js';
import { db } from '../db.js';
import { scoreToLevel, levelDescription, recommendedDeck } from '../lextale.js';

export async function renderPlacement(app) {
  let items = [];
  try {
    const resp = await fetch('./data/lextale-items.json');
    items = await resp.json();
  } catch (err) {
    app.appendChild(el('div', { class: 'view-modal' },
      buildCloseButton(),
      el('h1', { class: 'mt-5' }, 'Falha ao carregar teste'),
      el('p', { class: 'muted mt-3' }, err.message)
    ));
    return;
  }

  const shuffled = shuffle(items);
  const answers = [];
  let idx = 0;

  const container = el('div', { class: 'view-modal' });
  app.appendChild(container);

  function showIntro() {
    clear(container);
    container.appendChild(buildCloseButton());
    container.appendChild(el('div', { class: 'placement-screen' },
      el('header', { class: 'page-title', style: { marginTop: '2rem' } },
        el('h1', {}, 'Teste de nivelamento')
      ),
      el('p', { class: 'muted mt-3' }, `${shuffled.length} palavras em inglês. Para cada uma, marque "Conheço" ou "Não conheço".`),
      el('p', { class: 'muted mt-3' }, 'Parte das palavras é inventada — marque "Não conheço" nessas. Isso permite ao algoritmo (LexTALE) corrigir chutes.'),
      el('div', { class: 'placement-buttons mt-5' },
        el('button', {
          class: 'btn btn-primary btn-large btn-block',
          onclick: () => showQuestion()
        }, 'Começar')
      )
    ));
  }

  function showQuestion() {
    clear(container);
    container.appendChild(buildCloseButton());

    const item = shuffled[idx];
    container.appendChild(el('div', { class: 'placement-screen' },
      el('div', { class: 'modal-header' },
        el('span', { class: 'modal-counter' },
          el('span', { class: 'num mono' }, String(idx + 1)),
          ' / ', el('span', { class: 'mono' }, String(shuffled.length))
        )
      ),
      el('div', { class: 'placement-progress' },
        el('div', {
          class: 'placement-progress-bar',
          style: { width: `${(idx / shuffled.length) * 100}%` }
        })
      ),
      el('div', { class: 'placement-word' }, item.word),
      el('div', { class: 'placement-buttons' },
        el('button', {
          class: 'btn btn-success btn-large',
          onclick: () => answer(true)
        }, 'Conheço'),
        el('button', {
          class: 'btn btn-large',
          onclick: () => answer(false)
        }, 'Não conheço')
      )
    ));
  }

  function answer(knows) {
    answers.push({ word: shuffled[idx].word, isReal: shuffled[idx].isReal, knows });
    idx++;
    if (idx >= shuffled.length) showResult();
    else showQuestion();
  }

  async function showResult() {
    const real = answers.filter((a) => a.isReal);
    const fake = answers.filter((a) => !a.isReal);
    const realCorrect = real.filter((a) => a.knows).length;
    const fakeCorrect = fake.filter((a) => !a.knows).length;
    const realPct = real.length ? (realCorrect / real.length) * 100 : 0;
    const fakePct = fake.length ? (fakeCorrect / fake.length) * 100 : 0;
    const score = (realPct + fakePct) / 2;
    const level = scoreToLevel(score);

    await db.setSetting('cefrLevel', level);
    await db.setSetting('lextaleScore', score);
    await db.setSetting('lextaleCompletedAt', Date.now());

    clear(container);
    container.appendChild(buildCloseButton());
    container.appendChild(el('div', { class: 'result-screen' },
      el('span', { class: 'hero-label' }, 'Resultado'),
      el('div', { class: 'result-score' }, `${Math.round(score)}%`),
      el('div', { class: 'result-level' }, `Nível ${level.toUpperCase()}`),
      el('p', { class: 'result-description' }, levelDescription(level)),
      el('p', { class: 'mute2 mono', style: { fontSize: '0.85rem', marginBottom: '2rem' } },
        `${realCorrect}/${real.length} reais reconhecidas · ${fakeCorrect}/${fake.length} inventadas rejeitadas`
      ),
      el('div', { class: 'result-actions' },
        el('a', {
          href: '#/decks',
          class: 'btn btn-primary btn-large btn-block'
        }, `Carregar deck ${recommendedDeck(level).toUpperCase()}`),
        el('a', { href: '#/', class: 'btn btn-block' }, 'Início')
      )
    ));
  }

  showIntro();
}

function buildCloseButton() {
  return el('a', {
    href: '#/',
    class: 'modal-close',
    'aria-label': 'Fechar'
  }, icon('close'));
}
