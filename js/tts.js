/**
 * Text-to-speech wrapper using Web Speech API.
 * Notes:
 *   - iOS Safari requires a user-gesture for the very first speak() call;
 *     warmupTTS() should be invoked from a click/tap handler.
 *   - Voices load asynchronously; the voiceschanged event fires when ready.
 */

import { db } from './db.js';

let _voices = [];
let _warmedUp = false;
let _preferredVoiceName = '';
let _ttsRate = 0.9;
let _settingsPromise = null;

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const loadVoices = () => { _voices = speechSynthesis.getVoices(); };
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function loadSettings() {
  if (_settingsPromise) return _settingsPromise;
  _settingsPromise = (async () => {
    try {
      _preferredVoiceName = (await db.getSetting('ttsVoice', '')) || '';
      const rate = await db.getSetting('ttsRate', 0.9);
      if (typeof rate === 'number' && !Number.isNaN(rate)) _ttsRate = rate;
    } catch (err) {
      console.warn('[tts] settings load failed:', err);
    }
  })();
  return _settingsPromise;
}

if (typeof window !== 'undefined') loadSettings();

export function isSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getVoices() {
  return _voices;
}

export async function setTtsRate(rate) {
  _ttsRate = Number(rate);
  await db.setSetting('ttsRate', _ttsRate);
}

export async function setTtsVoice(name) {
  _preferredVoiceName = name || '';
  await db.setSetting('ttsVoice', _preferredVoiceName);
}

export function warmupTTS() {
  if (!isSupported() || _warmedUp) return;
  try {
    const u = new SpeechSynthesisUtterance('ready');
    u.lang = 'en-US';
    u.volume = 0;
    speechSynthesis.speak(u);
    _warmedUp = true;
  } catch (err) {
    console.warn('[tts] warmup failed:', err);
  }
}

function pickVoice() {
  if (_preferredVoiceName) {
    const v = _voices.find((vo) => vo.name === _preferredVoiceName);
    if (v) return v;
  }
  return (
    _voices.find((v) => v.lang === 'en-US' && v.default) ||
    _voices.find((v) => v.lang === 'en-US') ||
    _voices.find((v) => v.lang === 'en-GB') ||
    _voices.find((v) => v.lang.startsWith('en')) ||
    _voices[0]
  );
}

// Síncrono de propósito: iOS Safari (especialmente PWA standalone) exige que
// speechSynthesis.speak() seja chamado no mesmo tick do gesto de usuário, sem
// awaits intermediários. Settings são pré-carregadas em memória pra evitar
// hit no IDB no caminho crítico.
export function speak(text, opts = {}) {
  if (!isSupported() || !text) return;

  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = opts.rate ?? _ttsRate;
    utterance.pitch = opts.pitch ?? 1;
    utterance.volume = opts.volume ?? 1;
    speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[tts] speak failed:', err);
  }
}

export function cancel() {
  if (isSupported()) speechSynthesis.cancel();
}
