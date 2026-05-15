/**
 * Firebase wrapper. Auth anônimo + Firestore para backup automático por
 * instalação. Cross-device é via Export/Import manual — popups do Google
 * não funcionam em PWA standalone no iOS, então Google linking foi removido.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  persistentLocalCache
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Firebase Web SDK config — APIs key é pública por design.
// Segurança vem de: Firestore Rules + Authorized domains + (opcional) App Check.
// Mais info: https://firebase.google.com/docs/projects/api-keys
// GitHub secret scanner flag is a false positive — dismiss as "Used in tests".
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA_ZZLLkH6TUApKfPKel-mB1gTn4sNsv_k",
  authDomain: "matcards-5b17b.firebaseapp.com",
  projectId: "matcards-5b17b",
  storageBucket: "matcards-5b17b.firebasestorage.app",
  messagingSenderId: "667336213127",
  appId: "1:667336213127:web:a28cc19dddc5d48e6d2e22",
  measurementId: "G-T4G1CPWVX4"
};

export function isConfigured() {
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'REPLACE_ME' && !!FIREBASE_CONFIG.projectId;
}

let _app = null;
let _auth = null;
let _db = null;

function ensureInit() {
  if (!isConfigured()) {
    throw new Error('Firebase não configurado. Edite js/firebase.js com a configuração do seu projeto Firebase.');
  }
  if (!_app) {
    _app = initializeApp(FIREBASE_CONFIG);
    _auth = getAuth(_app);
    try {
      _db = initializeFirestore(_app, { localCache: persistentLocalCache() });
    } catch {
      _db = initializeFirestore(_app, {});
    }
  }
}

export function getAuthSafe() {
  ensureInit();
  return _auth;
}

export function getDbSafe() {
  ensureInit();
  return _db;
}

export function ensureSignedIn(timeoutMs = 10000) {
  ensureInit();
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Timeout no sign-in anônimo. Verifique sua internet e config do Firebase.'));
      }
    }, timeoutMs);

    const unsub = onAuthStateChanged(_auth, async (user) => {
      if (resolved) return;
      if (user) {
        resolved = true;
        clearTimeout(timer);
        unsub();
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(_auth);
          resolved = true;
          clearTimeout(timer);
          unsub();
          resolve(cred.user);
        } catch (err) {
          resolved = true;
          clearTimeout(timer);
          unsub();
          reject(err);
        }
      }
    });
  });
}

export function currentUser() {
  if (!_auth) return null;
  return _auth.currentUser;
}

export { doc, setDoc, getDoc, deleteDoc, serverTimestamp };
