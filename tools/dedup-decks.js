// Marca cards duplicados entre decks por front.text normalizado.
//
// Uso:
//   node tools/dedup-decks.js              # só relatório (não modifica nada)
//   node tools/dedup-decks.js --apply      # marca _dup: true nos JSONs (mantém ocorrência no menor nível CEFR)
//
// Por que: estudar "water" em 4 decks ao mesmo tempo desperdiça SRS budget.

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const DATA_DIR = path.resolve(__dirname, '..', 'data');

const deckFiles = fs.readdirSync(DATA_DIR)
  .filter(f => f.startsWith('deck-') && f.endsWith('.json'));

if (!deckFiles.length) {
  console.error('[dedup] nenhum deck-*.json em data/');
  process.exit(1);
}

const decks = deckFiles.map(f => ({
  file: f,
  path: path.join(DATA_DIR, f),
  json: JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'))
}));

const index = new Map();
for (const d of decks) {
  if (!Array.isArray(d.json.cards)) continue;
  d.json.cards.forEach((c, idx) => {
    const key = normalize(c.front && c.front.text);
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ deck: d, cardIdx: idx, term: c.front && c.front.text });
  });
}

const dups = [];
for (const [, locs] of index) if (locs.length > 1) dups.push(locs);

console.log(`[dedup] ${dups.length} termos duplicados entre ${decks.length} decks`);
for (const locs of dups.slice(0, 30)) {
  console.log(`  "${locs[0].term}" → ${locs.map(l => `${l.deck.file}[${l.cardIdx}]`).join(', ')}`);
}
if (dups.length > 30) console.log(`  ... (+${dups.length - 30} mais)`);

if (APPLY) {
  const LEVEL_ORDER = { a1: 0, a2: 1, b1: 2, b2: 3, c1: 4, c2: 5 };
  let marked = 0;
  for (const locs of dups) {
    locs.sort((a, b) => (LEVEL_ORDER[a.deck.json.level] ?? 9) - (LEVEL_ORDER[b.deck.json.level] ?? 9));
    for (let i = 1; i < locs.length; i++) {
      const { deck, cardIdx } = locs[i];
      deck.json.cards[cardIdx]._dup = true;
      marked++;
    }
  }
  for (const d of decks) fs.writeFileSync(d.path, JSON.stringify(d.json, null, 2), 'utf8');
  console.log(`[dedup] --apply: ${marked} cards marcados _dup:true (mantida ocorrência em menor nível CEFR)`);
} else {
  console.log('[dedup] use --apply pra marcar _dup:true no JSON');
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^to\s+/, '')
    .trim();
}
