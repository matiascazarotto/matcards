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
      el('p', { class: 'subtitle' }, 'Aprenda inglês com repetição espaçada')
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
      el('h2', {}, 'Bem-vindo!'),
      el('p', {}, 'Vamos começar descobrindo seu nível de inglês.'),
      el('p', { class: 'muted' }, 'Teste rápido de ~5 minutos.'),
      el('a', { href: '#/placement', class: 'btn btn-primary btn-large btn-block' }, 'Fazer teste de nivelamento')
    ),

    el('div', { class: 'card', style: { textAlign: 'center' } },
      el('p', { class: 'muted', style: { marginBottom: '0.75rem' } }, 'Ou se você já tem um backup salvo:'),
      buildImportButton()
    )
  );
}

function buildDashboard(cefrLevel, lextaleScore, decks, dueToday, newCount, streak) {
  return el('div', {},
    el('section', { class: 'card-hero' },
      el('h2', {}, `Nível ${cefrLevel.toUpperCase()}`),
      lextaleScore != null ? el('p', { class: 'muted' }, `Pontuação LexTALE: ${Math.round(lextaleScore)}%`) : null,
      el('a', {
        href: decks.length === 0 ? '#/decks' : '#/review',
        class: 'btn btn-primary btn-large btn-block'
      }, decks.length === 0 ? 'Carregar deck' : 'Estudar agora')
    ),

    el('div', { class: 'stats-row' },
      el('div', { class: 'stat-tile' },
        el('span', { class: 'value' }, String(dueToday)),
        el('span', { class: 'label' }, 'devidos hoje')
      ),
      el('div', { class: 'stat-tile' },
        el('span', { class: 'value' }, String(newCount)),
        el('span', { class: 'label' }, 'novos')
      ),
      el('div', { class: 'stat-tile' },
        el('span', { class: 'value' }, `${streak}🔥`),
        el('span', { class: 'label' }, 'streak')
      )
    ),

    el('nav', { class: 'nav-links' },
      el('a', { href: '#/decks' }, '📚 Decks'),
      el('a', { href: '#/stats' }, '📊 Stats'),
      el('a', { href: '#/settings' }, '⚙️ Config')
    )
  );
}

function buildImportButton() {
  return el('label', { class: 'btn btn-block', style: { cursor: 'pointer' } },
    '⬆️ Importar backup',
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
          alert('✓ Backup importado com sucesso!');
          location.hash = '#/';
          location.reload();
        } catch (err) {
          alert('Erro ao importar: ' + err.message);
        }
      }
    })
  );
}

function buildBackupReminder(lastExport) {
  if (localStorage.getItem('backupReminderDismissed')) {
    const dismissed = Number(localStorage.getItem('backupReminderDismissed'));
    if (Date.now() - dismissed < 14 * 86_400_000) return null;
  }

  const noBackup = !lastExport;
  const oldBackup = lastExport && daysSince(lastExport) >= 14;
  if (!noBackup && !oldBackup) return null;

  const msg = noBackup
    ? 'Você ainda não fez backup. Faça um para não perder progresso se trocar de celular.'
    : `Último backup há ${daysSince(lastExport)} dias. Considere fazer um novo.`;

  return el('div', { class: 'install-banner' },
    el('button', {
      class: 'close',
      onclick: (e) => {
        localStorage.setItem('backupReminderDismissed', String(Date.now()));
        e.target.closest('.install-banner').remove();
      }
    }, '×'),
    el('h3', {}, '💾 Lembrete de backup'),
    el('p', {}, msg),
    el('a', { href: '#/settings', class: 'btn btn-primary', style: { marginTop: '0.5rem' } }, 'Ir para backup')
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
    el('h3', {}, '⚠️ Sync GitHub falhou'),
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
    el('h3', {}, '📱 Instale no seu iPhone'),
    el('p', {}, 'Toque no botão Compartilhar (⬆️ na barra do Safari) → "Adicionar à Tela de Início".'),
    hasData ? el('p', { class: 'muted', style: { marginTop: '0.5rem' } },
      '⚠️ Importante: o iOS guarda dados separados entre Safari e app instalado. Para preservar seu progresso, faça um Export (Config → Exportar) e Import depois de instalar.'
    ) : el('p', { class: 'muted', style: { marginTop: '0.5rem' } },
      '💡 Dica: instale ANTES de fazer o teste de nivelamento, pra não precisar refazer depois.'
    )
  );
}
