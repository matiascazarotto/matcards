const DB_NAME = 'flashcards-db';
const DB_VERSION = 1;

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('decks')) {
        const s = db.createObjectStore('decks', { keyPath: 'id' });
        s.createIndex('level', 'level', { unique: false });
      }
      if (!db.objectStoreNames.contains('cards')) {
        const s = db.createObjectStore('cards', { keyPath: 'id' });
        s.createIndex('deckId', 'deckId', { unique: false });
      }
      if (!db.objectStoreNames.contains('reviews')) {
        const s = db.createObjectStore('reviews', { keyPath: 'cardId' });
        s.createIndex('dueDate', 'dueDate', { unique: false });
        s.createIndex('state', 'state', { unique: false });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('startedAt', 'startedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('[db] open blocked — close other tabs');
  });
  return _dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeTx(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export const db = {
  async get(store, key) {
    const s = await storeTx(store);
    return wrap(s.get(key));
  },

  async put(store, value) {
    const s = await storeTx(store, 'readwrite');
    return wrap(s.put(value));
  },

  async putMany(store, values) {
    const dbi = await openDB();
    return new Promise((resolve, reject) => {
      const tx = dbi.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      values.forEach((v) => s.put(v));
      tx.oncomplete = () => resolve(values.length);
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAll(store) {
    const s = await storeTx(store);
    return wrap(s.getAll());
  },

  async delete(store, key) {
    const s = await storeTx(store, 'readwrite');
    return wrap(s.delete(key));
  },

  async clear(store) {
    const s = await storeTx(store, 'readwrite');
    return wrap(s.clear());
  },

  async count(store) {
    const s = await storeTx(store);
    return wrap(s.count());
  },

  async getByIndex(store, indexName, value) {
    const s = await storeTx(store);
    return wrap(s.index(indexName).getAll(value));
  },

  async getByIndexRange(store, indexName, range) {
    const s = await storeTx(store);
    return wrap(s.index(indexName).getAll(range));
  },

  async setSetting(key, value) {
    return this.put('settings', { key, value });
  },

  async getSetting(key, defaultValue = null) {
    const r = await this.get('settings', key);
    return r ? r.value : defaultValue;
  },

  async resetAll() {
    const stores = ['decks', 'cards', 'reviews', 'sessions', 'settings'];
    for (const s of stores) await this.clear(s);
  }
};

export async function importDeckFromJSON(json) {
  if (!json || !json.cards || !Array.isArray(json.cards)) throw new Error('JSON de deck inválido');

  const { uuid } = await import('./utils.js');
  const { initialReview } = await import('./srs.js');

  const deckId = json.id || uuid();
  const now = Date.now();

  const deckRecord = {
    id: deckId,
    name: json.name || 'Deck sem nome',
    level: json.level || 'b1',
    description: json.description || '',
    cardCount: json.cards.length,
    enabled: true,
    builtIn: Boolean(json.id),
    createdAt: now
  };

  const cardRecords = [];
  const reviewRecords = [];

  for (const c of json.cards) {
    const cardId = uuid();
    const record = {
      id: cardId,
      deckId,
      type: c.type || 'basic',
      front: c.front || {},
      back: c.back || {},
      tags: c.tags || [],
      level: c.level || deckRecord.level,
      createdAt: now
    };
    if (c.cloze) record.cloze = c.cloze;
    cardRecords.push(record);
    reviewRecords.push(initialReview(cardId));
  }

  await db.put('decks', deckRecord);
  await db.putMany('cards', cardRecords);
  await db.putMany('reviews', reviewRecords);

  return deckRecord;
}
