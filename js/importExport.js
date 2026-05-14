import { db, openDB } from './db.js';

const STORES = ['decks', 'cards', 'reviews', 'sessions', 'settings'];

const SENSITIVE_SETTING_KEYS = [
  'githubToken',
  'githubLastSyncError',
  'githubLastSyncSha',
  'githubLastSyncAt',
  'cloudLastSyncError',
  'cloudLastSyncAt'
];

const LOCAL_ONLY_SETTING_KEYS = [
  'githubRepo',
  'githubToken',
  'githubAutoSync',
  'githubLastSyncAt',
  'githubLastSyncError',
  'githubLastSyncSha',
  'cloudSyncEnabled',
  'cloudLastSyncAt',
  'cloudLastSyncError'
];

export async function exportAll() {
  const dump = { version: 1, exportedAt: Date.now() };
  for (const store of STORES) {
    dump[store] = await db.getAll(store);
  }
  dump.settings = (dump.settings || []).filter(
    (s) => !SENSITIVE_SETTING_KEYS.includes(s.key)
  );
  return dump;
}

export async function importAll(data) {
  if (!data || typeof data !== 'object') throw new Error('Arquivo inválido');
  if (data.version && data.version > 1) throw new Error('Versão de backup desconhecida');

  const preservedSettings = [];
  for (const key of LOCAL_ONLY_SETTING_KEYS) {
    const existing = await db.get('settings', key);
    if (existing) preservedSettings.push(existing);
  }

  for (const store of STORES) {
    if (!Array.isArray(data[store])) continue;
    await db.clear(store);
    let values = data[store];
    if (store === 'settings') {
      values = values.filter((s) => !LOCAL_ONLY_SETTING_KEYS.includes(s.key));
    }
    if (values.length > 0) await db.putMany(store, values);
  }

  if (preservedSettings.length > 0) {
    await db.putMany('settings', preservedSettings);
  }
}

export function downloadJSON(obj, filename = 'matcards-backup.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
