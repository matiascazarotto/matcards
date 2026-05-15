import { openDB } from './db.js';
import { clear, el, icon } from './utils.js';
import { ensureSignedIn, isConfigured as isFirebaseConfigured } from './firebase.js';
import { renderHome } from './views/home.js';
import { renderPlacement } from './views/placement.js';
import { renderReview } from './views/review.js';
import { renderDecks } from './views/decks.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { renderHistory } from './views/history.js';
import { warmupTTS } from './tts.js';

const TABS = [
  { id: 'home', label: 'Início', hash: '#/', icon: 'home', match: /^#?\/?$/ },
  { id: 'decks', label: 'Decks', hash: '#/decks', icon: 'decks', match: /^#\/decks/ },
  { id: 'stats', label: 'Estatísticas', hash: '#/stats', icon: 'stats', match: /^#\/stats/ },
  { id: 'settings', label: 'Configurações', hash: '#/settings', icon: 'settings', match: /^#\/settings/ }
];

const routes = [
  { match: /^#?\/?$/, render: renderHome, modal: false },
  { match: /^#\/placement/, render: renderPlacement, modal: true },
  { match: /^#\/review/, render: renderReview, modal: true },
  { match: /^#\/decks/, render: renderDecks, modal: false },
  { match: /^#\/stats/, render: renderStats, modal: false },
  { match: /^#\/settings/, render: renderSettings, modal: false },
  { match: /^#\/history/, render: renderHistory, modal: true }
];

function getRoute() {
  return location.hash || '#/';
}

function buildTabBar() {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  clear(bar);
  for (const tab of TABS) {
    bar.appendChild(
      el('a', { href: tab.hash, class: 'tab-item', dataset: { tab: tab.id } },
        icon(tab.icon),
        el('span', { class: 'tab-label' }, tab.label)
      )
    );
  }
}

function updateTabBar(hash, modal) {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  bar.hidden = Boolean(modal);
  const activeTab = TABS.find((t) => t.match.test(hash));
  bar.querySelectorAll('.tab-item').forEach((item) => {
    item.classList.toggle('active', activeTab && item.dataset.tab === activeTab.id);
  });
}

async function route() {
  const hash = getRoute();
  const content = document.getElementById('content');
  const matched = routes.find((r) => r.match.test(hash)) || routes[0];

  clear(content);
  updateTabBar(hash, matched.modal);

  try {
    await matched.render(content, hash);
  } catch (err) {
    console.error('[router] view error:', err);
    clear(content);
    content.appendChild(el('div', { class: 'view' },
      el('h1', { class: 'page-title' }, 'Erro'),
      el('p', { class: 'muted' }, err.message || 'Falha inesperada.'),
      el('a', { class: 'btn mt-3', href: '#/' }, 'Início')
    ));
  }

  window.scrollTo(0, 0);
}

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function isReviewLink(target) {
  const link = target?.closest?.('a[href^="#/review"]');
  return Boolean(link);
}

function warmupReviewAudio(e) {
  if (isReviewLink(e.target)) warmupTTS();
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

  buildTabBar();
  document.addEventListener('pointerdown', warmupReviewAudio, { capture: true });
  document.addEventListener('click', warmupReviewAudio, { capture: true });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && isReviewLink(e.target)) warmupTTS();
  }, { capture: true });
  window.addEventListener('hashchange', route);
  route();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.__app = { navigate, route };
