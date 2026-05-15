// In-app converter Anki .apkg → matcards deck JSON.
// Roda no browser (sql.js WASM + JSZip). Libs vendoradas em vendor/.
// Lazy-load: nada baixa até alguém de fato importar um .apkg.

let _sqlReady = null;
let _jszipReady = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

async function ensureSql() {
  if (_sqlReady) return _sqlReady;
  _sqlReady = (async () => {
    if (!window.initSqlJs) await loadScript('./vendor/sql-wasm.js');
    return window.initSqlJs({ locateFile: () => './vendor/sql-wasm.wasm' });
  })();
  return _sqlReady;
}

async function ensureJSZip() {
  if (_jszipReady) return _jszipReady;
  _jszipReady = (async () => {
    if (!window.JSZip) await loadScript('./vendor/jszip.min.js');
    return window.JSZip;
  })();
  return _jszipReady;
}

export async function parseApkg(file, opts = {}) {
  const [SQL, JSZip] = await Promise.all([ensureSql(), ensureJSZip()]);

  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const collEntry = zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!collEntry) throw new Error('Arquivo .apkg sem collection.anki21/anki2 — não parece um deck Anki válido.');

  const dbBytes = await collEntry.async('uint8array');
  const db = new SQL.Database(dbBytes);

  const level = (opts.level || 'b1').toLowerCase();
  const cards = [];
  let skipped = 0;

  const stmt = db.prepare('SELECT flds, tags FROM notes');
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const fields = String(row.flds || '').split('\x1f').map(cleanField);
    const noteTags = String(row.tags || '').split(/\s+/).filter(Boolean);
    if (!fields[0]) { skipped++; continue; }
    const card = mapNoteToCard(fields, noteTags, level);
    if (card) cards.push(card);
    else skipped++;
  }
  stmt.free();
  db.close();

  const defaultName = file.name.replace(/\.apkg$/i, '');
  const name = opts.name || defaultName;
  return {
    id: `imported-${slugify(opts.id || name)}`,
    name,
    level,
    description: `Importado do .apkg "${file.name}" — ${cards.length} cards${skipped ? ` (${skipped} skipped)` : ''}.`,
    cards,
    _meta: { skipped, source: 'apkg-in-app' }
  };
}

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
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
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function mapNoteToCard(fields, noteTags, level) {
  const front = fields[0];
  if (!front) return null;

  let back = fields[1] || '';
  if (back.length > 0 && back.length < 6 && fields[2]) back = `${back}. ${fields[2]}`;
  else if (!back && fields[2]) back = fields[2];

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
