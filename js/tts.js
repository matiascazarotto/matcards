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

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const loadVoices = () => { _voices = speechSynthesis.getVoices(); };
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

export function isSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getVoices() {
  return _voices;
}

export function warmupTTS() {
  if (!isSupported() || _warmedUp) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
    _warmedUp = true;
  } catch (err) {
    console.warn('[tts] warmup failed:', err);
  }
}

async function pickVoice() {
  const preferred = await db.getSetting('ttsVoice', '');
  if (preferred) {
    const v = _voices.find((vo) => vo.name === preferred);
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

export async function speak(text, opts = {}) {
  if (!isSupported() || !text) return;

  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    const voice = await pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = opts.rate ?? (await db.getSetting('ttsRate', 0.9));
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
