import { el, clear, shuffle } from '../utils.js';
import { db } from '../db.js';
import { scoreToLevel, levelDescription, recommendedDeck } from '../lextale.js';

export async function renderPlacement(app) {
  let items = [];
  try {
    const resp = await fetch('./data/lextale-items.json');
    items = await resp.json();
  } catch (err) {
    app.appendChild(el('div', { class: 'view' },
      el('h2', {}, 'Erro ao carregar teste'),
      el('p', {}, err.message),
      el('a', { class: 'btn', href: '#/' }, 'Voltar')
    ));
    return;
  }

  const shuffled = shuffle(items);
  const answers = [];
  let idx = 0;

  const container = el('div', { class: 'view' });
  app.appendChild(container);

  function showIntro() {
    clear(container);
    container.appendChild(el('section', { class: 'card-hero' },
      el('h2', {}, 'Teste de Nivelamento'),
      el('p', {}, `Você verá ${shuffled.length} palavras em inglês.`),
      el('p', {}, 'Para cada palavra, marque:'),
      el('p', {}, el('strong', {}, '"Conheço"'), ' — se você sabe o significado.'),
      el('p', {}, el('strong', {}, '"Não conheço"'), ' — se não sabe ou não tem certeza.'),
      el('p', { class: 'muted' }, '⚠️ Algumas palavras são inventadas — marque "Não conheço". Seja honesto, isso ajuda na precisão.'),
      el('button', {
        class: 'btn btn-primary btn-large btn-block',
        onclick: () => showQuestion()
      }, 'Começar teste')
    ));
  }

  function showQuestion() {
    clear(container);

    const item = shuffled[idx];
    const screen = el('div', { class: 'placement-screen' },
      el('div', { class: 'placement-progress' },
        el('div', {
          class: 'placement-progress-bar',
          style: { width: `${(idx / shuffled.length) * 100}%` }
        })
      ),
      el('p', { class: 'muted' }, `${idx + 1} de ${shuffled.length}`),
      el('div', { class: 'placement-word' }, item.word),
      el('div', { class: 'placement-buttons' },
        el('button', {
          class: 'btn btn-success btn-large',
          onclick: () => answer(true)
        }, '✓ Conheço'),
        el('button', {
          class: 'btn btn-large',
          onclick: () => answer(false)
        }, '✗ Não conheço')
      )
    );

    container.appendChild(screen);
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
    container.appendChild(el('div', { class: 'result-screen' },
      el('h2', {}, 'Resultado do teste'),
      el('div', { class: 'result-score' }, `${Math.round(score)}%`),
      el('div', { class: 'result-level' }, `Nível: ${level.toUpperCase()}`),
      el('p', { class: 'result-description' }, levelDescription(level)),
      el('p', { class: 'muted' }, `Acertou ${realCorrect}/${real.length} palavras reais e identificou ${fakeCorrect}/${fake.length} inventadas.`),
      el('div', { class: 'btn-group', style: { width: '100%', maxWidth: '320px' } },
        el('a', {
          href: '#/decks',
          class: 'btn btn-primary btn-large btn-block'
        }, `Carregar deck ${recommendedDeck(level).toUpperCase()}`),
        el('a', { href: '#/', class: 'btn btn-block' }, 'Ir para o início')
      )
    ));
  }

  showIntro();
}
