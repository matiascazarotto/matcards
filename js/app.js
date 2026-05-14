import { openDB } from './db.js';
import { clear } from './utils.js';
import { ensureSignedIn, isConfigured as isFirebaseConfigured } from './firebase.js';
import { renderHome } from './views/home.js';
import { renderPlacement } from './views/placement.js';
import { renderReview } from './views/review.js';
import { renderDecks } from './views/decks.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { renderHistory } from './views/history.js';

const routes = [
  { match: /^#?\/?$/, render: renderHome },
  { match: /^#\/placement/, render: renderPlacement },
  { match: /^#\/review/, render: renderReview },
  { match: /^#\/decks/, render: renderDecks },
  { match: /^#\/stats/, render: renderStats },
  { match: /^#\/settings/, render: renderSettings },
  { match: /^#\/history/, render: renderHistory }
];

function getRoute() {
  return location.hash || '#/';
}

async function route() {
  const hash = getRoute();
  const app = document.getElementById('app');
  const matched = routes.find((r) => r.match.test(hash)) || routes[0];

  clear(app);
  try {
    await matched.render(app, hash);
  } catch (err) {
    console.error('[router] view error:', err);
    app.innerHTML = `<div class="view"><h2>Erro</h2><p>${err.message}</p><a class="btn" href="#/">Voltar</a></div>`;
  }

  window.scrollTo(0, 0);
}

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function init() {
  try {
    await openDB();
  } catch (err) {
    console.error('[db] init failed:', err);
  }

  if (isFirebaseConfigured()) {
    ensureSignedIn()
      .then((user) => {
        console.log('[auth] signed in as', user.isAnonymous ? `anonymous (${user.uid.slice(0, 8)}...)` : user.email);
      })
      .catch((err) => console.warn('[auth] sign-in failed:', err.message));
  } else {
    console.info('[auth] Firebase não configurado — sync na nuvem desabilitado');
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((e) => console.warn('[sw] registration failed:', e));
  }

  window.addEventListener('hashchange', route);
  route();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.__app = { navigate, route };
