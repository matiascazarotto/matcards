// Converte CSV → matcards deck JSON. Pra "deck de domínio em 1h" do plano.
//
// Formato esperado das colunas (header opcional, auto-detectado por nome em col 0):
//   term, definition, example_en_1, example_pt_1, example_en_2, example_pt_2, tags
//
// "tags" na linha vira card.tags (separados por ; ou |). --tags no CLI adiciona a todos.
//
// Uso:
//   node tools/csv-to-matcards.js --input=words.csv [--level=b2] [--name=...] [--tags=business,work]

const fs = require('fs');
const path = require('path');

const ARGS = parseArgs(process.argv.slice(2));
if (!ARGS.input) {
  console.error('Uso: node tools/csv-to-matcards.js --input=words.csv [--level=b2] [--name=...] [--tags=tag1,tag2] [--id=slug] [--out=...]');
  process.exit(1);
}

const LEVEL = String(ARGS.level || 'b1').toLowerCase();
const DEFAULT_NAME = path.basename(ARGS.input, path.extname(ARGS.input));
const NAME = ARGS.name || DEFAULT_NAME;
const SLUG = slugify(ARGS.id || NAME);
const DECK_ID = `custom-${SLUG}`;
const EXTRA_TAGS = (ARGS.tags || '').split(',').map(t => t.trim()).filter(Boolean);
const OUT_PATH = ARGS.out || path.resolve(__dirname, '..', 'data', `deck-${DECK_ID}.json`);

if (!fs.existsSync(ARGS.input)) {
  console.error(`[csv] arquivo não encontrado: ${ARGS.input}`);
  process.exit(2);
}

const raw = fs.readFileSync(ARGS.input, 'utf8');
const rows = parseCsv(raw);
if (!rows.length) {
  console.error('[csv] arquivo vazio');
  process.exit(3);
}

let dataStart = 0;
const first = rows[0].map(c => c.toLowerCase().trim());
if (first.includes('term') || first.includes('palavra') || first.includes('word')) dataStart = 1;

const cards = [];
for (let i = dataStart; i < rows.length; i++) {
  const r = rows[i];
  const term = (r[0] || '').trim();
  if (!term) continue;
  const def = (r[1] || '').trim();
  const exEn1 = (r[2] || '').trim();
  const exPt1 = (r[3] || '').trim();
  const exEn2 = (r[4] || '').trim();
  const exPt2 = (r[5] || '').trim();
  const rowTagsRaw = (r[6] || '').trim();
  const rowTags = rowTagsRaw ? rowTagsRaw.split(/[;|]/).map(t => t.trim()).filter(Boolean) : [];

  const examples = [];
  if (exEn1) examples.push({ en: exEn1, pt: exPt1 });
  if (exEn2) examples.push({ en: exEn2, pt: exPt2 });

  const card = {
    type: 'basic',
    front: { text: term },
    back: { text: def || '(sem definição)' },
    tags: Array.from(new Set([LEVEL, ...EXTRA_TAGS, ...rowTags])).slice(0, 8)
  };
  if (examples.length) card.back.examples = examples;
  cards.push(card);
}

const deck = {
  id: DECK_ID,
  name: NAME,
  level: LEVEL,
  description: `Custom — gerado de ${path.basename(ARGS.input)} via tools/csv-to-matcards.js`,
  cards
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(deck, null, 2), 'utf8');
console.log(`[csv] ${cards.length} cards escritos em ${OUT_PATH}`);

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith('--')) out[a.slice(2)] = true;
  }
  return out;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function parseCsv(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++;
      } else { cell += c; i++; }
    } else {
      if (c === '"') { inQuotes = true; i++; }
      else if (c === ',') { row.push(cell); cell = ''; i++; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
      else { cell += c; i++; }
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
  return rows;
}
