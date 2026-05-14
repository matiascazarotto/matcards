/**
 * Cloud sync via Firestore.
 *
 * Each user gets a unique uid (anonymous or linked Google). Backup is stored at:
 *   /users/{uid}/backup/current
 *
 * After each completed session, app pushes the full backup. Pull on demand
 * (e.g., on a new device after Google sign-in).
 */

import { db } from './db.js';
import { exportAll, importAll } from './importExport.js';
import {
  getDbSafe,
  getAuthSafe,
  ensureSignedIn,
  currentUser,
  isConfigured,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from './firebase.js';

const ROOT_COLLECTION = 'users';
const BACKUP_PATH = ['backup', 'current'];

function backupDocRef(uid) {
  return doc(getDbSafe(), ROOT_COLLECTION, uid, ...BACKUP_PATH);
}

export async function syncToCloud({ commitMessage } = {}) {
  if (!isConfigured()) return { skipped: true, reason: 'not_configured' };

  const enabled = await db.getSetting('cloudSyncEnabled', true);
  if (!enabled) return { skipped: true, reason: 'disabled' };

  try {
    const user = currentUser() || (await ensureSignedIn());
    const dump = await exportAll();
    dump.syncedAt = Date.now();
    dump.serverTimestamp = serverTimestamp();
    if (commitMessage) dump.message = commitMessage;

    await setDoc(backupDocRef(user.uid), dump, { merge: false });

    await db.setSetting('cloudLastSyncAt', Date.now());
    await db.delete('settings', 'cloudLastSyncError');
    return { ok: true, uid: user.uid, syncedAt: Date.now() };
  } catch (err) {
    const msg = friendlyError(err);
    await db.setSetting('cloudLastSyncError', msg);
    console.warn('[cloud-sync] failed:', err);
    return { ok: false, error: msg };
  }
}

export async function pullFromCloud() {
  if (!isConfigured()) throw new Error('Firebase não configurado');
  const user = currentUser() || (await ensureSignedIn());
  const snap = await getDoc(backupDocRef(user.uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return data;
}

export async function restoreFromCloud() {
  const data = await pullFromCloud();
  if (!data) throw new Error('Nenhum backup encontrado na nuvem para este usuário.');
  await importAll(data);
  return data;
}

export async function shouldAutoSync() {
  if (!isConfigured()) return false;
  return (await db.getSetting('cloudSyncEnabled', true)) !== false;
}

export function friendlyError(err) {
  const msg = err?.message || String(err);
  if (err?.code === 'unavailable') return 'Sem conexão. Tentaremos novamente depois.';
  if (err?.code === 'permission-denied') return 'Permissão negada pelo Firestore. Verifique as Security Rules.';
  if (err?.code === 'unauthenticated') return 'Não autenticado. Recarregue o app.';
  if (msg.includes('quota')) return 'Limite do Firebase atingido. Tente novamente mais tarde.';
  return msg;
}

export function generateRecoveryPhrase(uid) {
  const adjectives = ['HAPPY', 'SILVER', 'GOLDEN', 'PURPLE', 'SWIFT', 'BRIGHT', 'WILD', 'CALM', 'BOLD', 'WISE'];
  const animals = ['OWL', 'FOX', 'WOLF', 'EAGLE', 'BEAR', 'TIGER', 'DEER', 'HAWK', 'LION', 'SEAL'];
  let h1 = 0, h2 = 0, h3 = 0;
  for (let i = 0; i < uid.length; i++) {
    const c = uid.charCodeAt(i);
    h1 = (h1 * 31 + c) & 0xffff;
    h2 = (h2 * 37 + c) & 0xffff;
    h3 = (h3 * 41 + c) & 0xffff;
  }
  return `${adjectives[h1 % adjectives.length]}-${animals[h2 % animals.length]}-${(h3 % 99) + 1}`;
}
