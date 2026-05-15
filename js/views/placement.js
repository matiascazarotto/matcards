import { el, clear, shuffle, icon } from '../utils.js';
import { db } from '../db.js';
import { computeScore, levelDescription, recommendedDeck } from '../lextale.js';

const LEVEL_LABELS = ['a1', 'a2', 'b1', 'b2', 'c1'];

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
      el('p', { class: 'muted mt-3' }, 'Parte das palavras é inventada — marque "Não conheço" nessas. Isso corrige tentativas de chute.'),
      el('p', { class: 'muted mt-3' }, 'Palavras reais vêm de listas acadêmicas tagueadas por nível CEFR; pseudo-palavras vêm do teste LexTALE.'),
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
    const item = shuffled[idx];
    answers.push({ word: item.word, isReal: item.isReal, level: item.level, knows });
    idx++;
    if (idx >= shuffled.length) showResult();
    else showQuestion();
  }

  async function showResult() {
    const result = computeScore(answers);

    await db.setSetting('cefrLevel', result.level);
    await db.setSetting('lextaleScore', result.score);
    await db.setSetting('lextaleCompletedAt', Date.now());

    const breakdown = el('div', { class: 'placement-breakdown' },
      ...LEVEL_LABELS.map((L) => {
        const row = result.perLevel[L];
        const pct = Math.round(row.adjusted * 100);
        return el('div', { class: 'placement-breakdown-row' },
          el('span', { class: 'placement-breakdown-label mono' }, L.toUpperCase()),
          el('div', { class: 'placement-breakdown-bar' },
            el('div', {
              class: 'placement-breakdown-fill',
              style: { width: `${pct}%` }
            })
          ),
          el('span', { class: 'placement-breakdown-pct mono' }, `${row.correct}/${row.total}`)
        );
      })
    );

    const unreliableNote = result.unreliable
      ? el('p', { class: 'placement-warning' },
          `Atenção: ${result.fakeKnown} de ${result.fakeTotal} palavras inventadas marcadas como conhecidas. Resultado pode estar inflado — refaça com mais atenção.`)
      : null;

    clear(container);
    container.appendChild(buildCloseButton());
    container.appendChild(el('div', { class: 'result-screen' },
      el('span', { class: 'hero-label' }, 'Resultado'),
      el('div', { class: 'result-score' }, `${Math.round(result.score)}%`),
      el('div', { class: 'result-level' }, `Nível ${result.level.toUpperCase()}`),
      el('p', { class: 'result-description' }, levelDescription(result.level)),
      breakdown,
      el('p', { class: 'mute2 mono', style: { fontSize: '0.8rem', marginBottom: '1.5rem', textAlign: 'center' } },
        `Reconhecimento por nível · ${Math.round(result.falseAlarm * 100)}% falso-positivo descontado`
      ),
      unreliableNote,
      el('div', { class: 'result-actions' },
        el('a', {
          href: '#/decks',
          class: 'btn btn-primary btn-large btn-block'
        }, `Carregar deck ${recommendedDeck(result.level).toUpperCase()}`),
        el('a', { href: '#/', class: 'btn btn-block' }, 'Início')
      ),
      el('p', { class: 'mute2', style: { fontSize: '0.7rem', textAlign: 'center', marginTop: '2rem' } },
        'Itens: CEFR-J Vocabulary Profile v1.5 (Tono Lab, TUFS) · Octanove C1/C2 v1.0 · LexTALE (Lemhöfer & Broersma, 2012)'
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
