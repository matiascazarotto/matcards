// Converte deck Anki .apkg → matcards deck JSON.
//
// Uso:
//   node tools/apkg-to-matcards.js --input=path/to/deck.apkg [--level=b1] [--name="Nome"] [--id=slug] [--out=...]
//
// Dev deps (em tools/package.json): adm-zip, sql.js.
//   cd tools && npm install
//
// Por que existir: matcards ainda não importa .apkg in-app (roadmap).
// Converter local one-time → JSON, depois UI de import (importExport.js) consome.

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const initSqlJs = require('sql.js');

const ARGS = parseArgs(process.argv.slice(2));
if (!ARGS.input) {
  console.error('Uso: node tools/apkg-to-matcards.js --input=<.apkg> [--level=b1] [--name=...] [--id=slug] [--out=path.json]');
  process.exit(1);
}

const LEVEL = String(ARGS.level || 'b1').toLowerCase();
const DEFAULT_NAME = path.basename(ARGS.input, path.extname(ARGS.input));
const NAME = ARGS.name || DEFAULT_NAME;
const SLUG = slugify(ARGS.id || NAME);
const DECK_ID = `imported-${SLUG}`;
const OUT_PATH = ARGS.out || path.resolve(__dirname, '..', 'data', `deck-${DECK_ID}.json`);

(async () => {
  if (!fs.existsSync(ARGS.input)) {
    console.error(`[apkg] arquivo não encontrado: ${ARGS.input}`);
    process.exit(2);
  }

  console.log(`[apkg] lendo ${ARGS.input}`);
  const zip = new AdmZip(ARGS.input);
  const entries = zip.getEntries();
  const collEntry = entries.find(e => e.entryName === 'collection.anki21' || e.entryName === 'collection.anki2');
  if (!collEntry) {
    console.error('[apkg] ERRO: collection.anki21/anki2 não encontrada no zip');
    process.exit(3);
  }
  const dbBuffer = collEntry.getData();

  console.log('[apkg] inicializando sql.js');
  const SQL = await initSqlJs();
  const sqldb = new SQL.Database(new Uint8Array(dbBuffer));

  const stmt = sqldb.prepare('SELECT id, flds, tags FROM notes');
  const cards = [];
  let skipped = 0;

  while (stmt.step()) {
    const row = stmt.getAsObject();
    const fields = String(row.flds || '').split('\x1f').map(cleanField);
    const noteTags = String(row.tags || '').split(/\s+/).filter(Boolean);

    if (!fields[0]) { skipped++; continue; }
    const card = mapNoteToCard(fields, noteTags, LEVEL);
    if (card) cards.push(card);
    else skipped++;
  }
  stmt.free();
  sqldb.close();

  const deck = {
    id: DECK_ID,
    name: NAME,
    level: LEVEL,
    description: `Importado de ${path.basename(ARGS.input)} via tools/apkg-to-matcards.js`,
    cards
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(deck, null, 2), 'utf8');

  console.log(`[apkg] ${cards.length} cards escritos em ${OUT_PATH}`);
  if (skipped) console.log(`[apkg] ${skipped} notes puladas (front vazio ou inválida)`);
  console.log('[apkg] revisar amostragem antes de importar — heurísticas de field mapping podem precisar ajuste por deck.');
})().catch(err => {
  console.error('[apkg] erro fatal:', err);
  process.exit(99);
});

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

function cleanField(s) {
  if (!s) return '';
  return String(s)
    .replace(/\[sound:[^\]]+\]/g, '')
    .replace(/\[anki:[^\]]+\]/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapNoteToCard(fields, noteTags, level) {
  const front = fields[0];
  if (!front) return null;

  let back = fields[1] || '';
  if (back.length > 0 && back.length < 6 && fields[2]) {
    back = `${back}. ${fields[2]}`;
  } else if (!back && fields[2]) {
    back = fields[2];
  }

  const examples = [];
  for (let i = 2; i < fields.length; i++) {
    const f = fields[i];
    if (!f || f === back) continue;
    if (looksLikeSentence(f)) examples.push({ en: f, pt: '' });
  }

  const tags = Array.from(new Set([level, ...noteTags.map(t => t.toLowerCase())])).slice(0, 8);

  const card = {
    type: 'basic',
    front: { text: front },
    back: { text: back || '(sem definição)' },
    tags
  };
  if (examples.length) card.back.examples = examples.slice(0, 3);
  return card;
}

function looksLikeSentence(s) {
  if (!s || s.length < 15) return false;
  if (!/[.!?]$/.test(s.trim())) return false;
  if (!/\s/.test(s)) return false;
  if (/^https?:/.test(s)) return false;
  return true;
}
