import { db } from '../db.js';
import { el, dayKey, daysSince } from '../utils.js';
import { importAll } from '../importExport.js';

export async function renderHome(app) {
  const cefrLevel = await db.getSetting('cefrLevel');
  const lextaleScore = await db.getSetting('lextaleScore');
  const lastExport = await db.getSetting('lastExportAt');
  const cloudLastSyncError = await db.getSetting('cloudLastSyncError');
  const decks = await db.getAll('decks');
  const reviews = await db.getAll('reviews');

  const now = Date.now();
  const dueToday = reviews.filter((r) => r.dueDate <= now).length;
  const newCount = reviews.filter((r) => r.state === 'new').length;

  let streak = 0;
  if (reviews.length > 0) {
    const sessions = await db.getAll('sessions');
    const dayKeys = new Set(sessions.map((s) => dayKey(s.startedAt)));
    let d = new Date();
    while (dayKeys.has(dayKey(d.getTime()))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
  }

  const view = el('div', { class: 'view view-home' },
    el('header', { class: 'app-header' },
      el('h1', {}, 'matcards'),
      el('p', { class: 'subtitle' }, 'Spaced repetition para inglês.')
    ),

    !cefrLevel ? buildWelcome() : buildDashboard(cefrLevel, lextaleScore, decks, dueToday, newCount, streak)
  );

  if (cloudLastSyncError) {
    view.appendChild(buildSyncErrorBanner(cloudLastSyncError));
  }

  if (cefrLevel && reviews.length > 0 && !cloudLastSyncError) {
    const banner = buildBackupReminder(lastExport);
    if (banner) view.appendChild(banner);
  }

  if (!isStandalone() && isIOS()) {
    view.appendChild(buildInstallBanner(Boolean(cefrLevel || reviews.length)));
  }

  app.appendChild(view);
}

function buildWelcome() {
  return el('div', {},
    el('section', { class: 'card-hero' },
      el('p', {}, 'O app determina seu nível por meio do teste LexTALE (~5 min) e monta o deck adequado.'),
      el('a', { href: '#/placement', class: 'btn btn-primary btn-large btn-block' }, 'Iniciar teste')
    ),

    el('div', { class: 'card', style: { textAlign: 'center' } },
      el('p', { class: 'muted', style: { marginBottom: '0.75rem' } }, 'Já tem um backup?'),
      buildImportButton()
    )
  );
}

function buildDashboard(cefrLevel, lextaleScore, decks, dueToday, newCount, streak) {
  const headerText = lextaleScore != null
    ? `Nível ${cefrLevel.toUpperCase()} · Score LexTALE ${Math.round(lextaleScore)}%`
    : `Nível ${cefrLevel.toUpperCase()}`;

  return el('div', {},
    el('section', { class: 'card-hero' },
      el('h2', {}, headerText),
      el('a', {
        href: decks.length === 0 ? '#/decks' : '#/review',
        class: 'btn btn-primary btn-large btn-block'
      }, decks.length === 0 ? 'Carregar deck' : 'Iniciar revisão')
    ),

    el('div', { class: 'stats-row' },
      el('div', { class: 'stat-tile' },
        el('span', { class: 'value' }, String(dueToday)),
        el('span', { class: 'label' }, 'a revisar')
      ),
      el('div', { class: 'stat-tile' },
        el('span', { class: 'value' }, String(newCount)),
        el('span', { class: 'label' }, 'novos')
      ),
      el('div', { class: 'stat-tile' },
        el('span', { class: 'value' }, String(streak)),
        el('span', { class: 'label' }, streak === 1 ? 'dia seguido' : 'dias seguidos')
      )
    ),

    el('nav', { class: 'nav-links' },
      el('a', { href: '#/decks' }, 'Decks'),
      el('a', { href: '#/stats' }, 'Estatísticas'),
      el('a', { href: '#/settings' }, 'Configurações')
    )
  );
}

function buildImportButton() {
  return el('label', { class: 'btn btn-block', style: { cursor: 'pointer' } },
    'Importar backup',
    el('input', {
      type: 'file',
      accept: '.json,application/json',
      style: { display: 'none' },
      onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          await importAll(data);
          alert('Backup importado.');
          location.hash = '#/';
          location.reload();
        } catch (err) {
          alert('Falha ao importar: ' + err.message);
        }
      }
    })
  );
}

function buildBackupReminder(lastExport) {
  if (!lastExport || daysSince(lastExport) < 14) return null;

  if (localStorage.getItem('backupReminderDismissed')) {
    const dismissed = Number(localStorage.getItem('backupReminderDismissed'));
    if (Date.now() - dismissed < 14 * 86_400_000) return null;
  }

  return el('div', { class: 'install-banner' },
    el('button', {
      class: 'close',
      onclick: (e) => {
        localStorage.setItem('backupReminderDismissed', String(Date.now()));
        e.target.closest('.install-banner').remove();
      }
    }, '×'),
    el('h3', {}, 'Backup local'),
    el('p', {}, `Último export local há ${daysSince(lastExport)} dias.`),
    el('a', { href: '#/settings', class: 'btn btn-primary', style: { marginTop: '0.5rem' } }, 'Ir para Configurações')
  );
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function buildSyncErrorBanner(error) {
  return el('div', { class: 'install-banner', style: { borderColor: 'var(--danger)' } },
    el('h3', {}, 'Sync falhou'),
    el('p', { class: 'muted', style: { fontSize: '0.9rem' } }, error),
    el('a', { href: '#/settings', class: 'btn btn-primary', style: { marginTop: '0.5rem' } }, 'Resolver')
  );
}

function buildInstallBanner(hasData) {
  const dismissed = localStorage.getItem('installBannerDismissed');
  if (dismissed && Date.now() - Number(dismissed) < 7 * 86_400_000) return document.createDocumentFragment();

  return el('div', { class: 'install-banner' },
    el('button', {
      class: 'close',
      onclick: (e) => {
        localStorage.setItem('installBannerDismissed', String(Date.now()));
        e.target.closest('.install-banner').remove();
      }
    }, '×'),
    el('h3', {}, 'Instalar como app'),
    el('p', {}, 'Safari → Compartilhar → "Adicionar à Tela de Início".'),
    hasData ? el('p', { class: 'muted', style: { marginTop: '0.5rem' } },
      'iOS isola storage entre Safari e PWA instalada. Para preservar progresso, exporte um backup antes (Configurações → Exportar) e importe após instalar.'
    ) : el('p', { class: 'muted', style: { marginTop: '0.5rem' } },
      'Recomendado instalar antes do teste de nivelamento para evitar reiniciar.'
    )
  );
}
