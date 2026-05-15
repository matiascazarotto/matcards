import { el, clear } from '../utils.js';
import { db } from '../db.js';
import { exportAll, importAll, downloadJSON } from '../importExport.js';
import { getVoices } from '../tts.js';
import { isConfigured as isFirebaseConfigured, currentUser, isAnonymous, linkWithGoogle, signInWithGoogle, signOutCurrent } from '../firebase.js';
import { syncToCloud, restoreFromCloud, generateRecoveryPhrase } from '../cloud-sync.js';

export async function renderSettings(app) {
  const container = el('div', { class: 'view' });
  app.appendChild(container);

  await refresh();

  async function refresh() {
    clear(container);

    const cefrLevel = await db.getSetting('cefrLevel', '—');
    const lextaleScore = await db.getSetting('lextaleScore');
    const dailyNew = await db.getSetting('dailyNewCards', 20);
    const dailyReviews = await db.getSetting('dailyReviews', 200);
    const ttsRate = await db.getSetting('ttsRate', 0.9);
    const ttsVoice = await db.getSetting('ttsVoice', '');
    const audioAutoplay = await db.getSetting('audioAutoplay', true);
    const lastExport = await db.getSetting('lastExportAt');
    const cloudEnabled = await db.getSetting('cloudSyncEnabled', true);
    const cloudLastSyncAt = await db.getSetting('cloudLastSyncAt');
    const cloudLastSyncError = await db.getSetting('cloudLastSyncError');

    container.appendChild(el('header', { class: 'app-header' },
      el('a', { href: '#/', style: { color: 'var(--text-dim)', textDecoration: 'none' } }, '← Início'),
      el('h1', {}, 'Configurações')
    ));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Nível'),
      el('div', { class: 'settings-row' },
        el('label', {}, 'CEFR'),
        el('span', {}, String(cefrLevel).toUpperCase())
      ),
      lextaleScore != null ? el('div', { class: 'settings-row' },
        el('label', {}, 'Score LexTALE'),
        el('span', {}, `${Math.round(lextaleScore)}%`)
      ) : null,
      el('a', { href: '#/placement', class: 'btn btn-block', style: { marginTop: '0.5rem' } }, 'Refazer teste')
    ));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Limites'),
      el('div', { class: 'settings-row' },
        el('label', { for: 'dailyNew' }, 'Novos cards/dia'),
        el('input', {
          type: 'number', id: 'dailyNew', value: dailyNew, min: '0', max: '200',
          onchange: (e) => db.setSetting('dailyNewCards', Number(e.target.value))
        })
      ),
      el('div', { class: 'settings-row' },
        el('label', { for: 'dailyReviews' }, 'Revisões/dia'),
        el('input', {
          type: 'number', id: 'dailyReviews', value: dailyReviews, min: '0', max: '500',
          onchange: (e) => db.setSetting('dailyReviews', Number(e.target.value))
        })
      )
    ));

    const voices = getVoices();
    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Áudio (TTS)'),
      el('div', { class: 'settings-row' },
        el('label', { for: 'ttsRate' }, `Velocidade: ${Number(ttsRate).toFixed(1)}x`),
        el('input', {
          type: 'range', id: 'ttsRate', min: '0.5', max: '1.5', step: '0.1', value: ttsRate,
          oninput: (e) => {
            db.setSetting('ttsRate', Number(e.target.value));
            e.target.previousElementSibling.textContent = `Velocidade: ${Number(e.target.value).toFixed(1)}x`;
          }
        })
      ),
      voices.length > 0 ? el('div', { class: 'settings-row' },
        el('label', { for: 'ttsVoice' }, 'Voz'),
        buildVoiceSelect(voices, ttsVoice)
      ) : el('p', { class: 'muted' }, 'Carregando vozes do sistema.'),
      el('div', { class: 'settings-row' },
        el('label', { for: 'autoplay' }, 'Reprodução automática'),
        el('input', {
          type: 'checkbox', id: 'autoplay', checked: audioAutoplay,
          onchange: (e) => db.setSetting('audioAutoplay', e.target.checked)
        })
      )
    ));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Backup local'),
      el('p', { class: 'muted', style: { marginBottom: '0.75rem' } },
        'Export JSON manual. No iPhone, salve em Arquivos → iCloud Drive para acesso multi-device.'
      ),
      lastExport
        ? el('p', { class: 'muted' }, `Último export: ${new Date(lastExport).toLocaleDateString('pt-BR')}`)
        : el('p', { class: 'muted' }, 'Nenhum export realizado.'),
      el('div', { class: 'btn-group' },
        el('button', {
          class: 'btn btn-primary',
          onclick: async () => {
            const json = await exportAll();
            downloadJSON(json, `matcards-backup-${new Date().toISOString().slice(0, 10)}.json`);
            await db.setSetting('lastExportAt', Date.now());
            refresh();
          }
        }, 'Exportar'),
        el('label', { class: 'btn' },
          'Importar',
          el('input', {
            type: 'file', accept: '.json', style: { display: 'none' },
            onchange: async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              if (!confirm('Importar substitui todos os dados locais. Continuar?')) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text);
                await importAll(data);
                alert('Importado. Recarregando.');
                location.hash = '#/';
                location.reload();
              } catch (err) {
                alert('Falha ao importar: ' + err.message);
              }
            }
          })
        )
      )
    ));

    container.appendChild(buildCloudSection({ cloudEnabled, cloudLastSyncAt, cloudLastSyncError, refresh }));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Zona crítica'),
      el('button', {
        class: 'btn btn-danger btn-block',
        onclick: async () => {
          if (!confirm('Apagar todos os dados locais (decks, cards, progresso, configurações). Irreversível. Continuar?')) return;
          if (!confirm('Confirmar?')) return;
          await db.resetAll();
          location.hash = '#/';
          location.reload();
        }
      }, 'Apagar dados locais')
    ));
  }

  function buildVoiceSelect(voices, current) {
    const enVoices = voices.filter((v) => v.lang.startsWith('en'));
    const select = el('select', {
      id: 'ttsVoice',
      onchange: (e) => db.setSetting('ttsVoice', e.target.value)
    });
    select.appendChild(el('option', { value: '' }, 'Padrão do sistema'));
    enVoices.forEach((v) => {
      const opt = el('option', { value: v.name }, `${v.name} (${v.lang})`);
      if (v.name === current) opt.selected = true;
      select.appendChild(opt);
    });
    return select;
  }
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `${days} dias atrás`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

function buildCloudSection({ cloudEnabled, cloudLastSyncAt, cloudLastSyncError, refresh }) {
  if (!isFirebaseConfigured()) {
    return el('div', { class: 'settings-section' },
      el('h3', {}, 'Sincronização'),
      el('p', { class: 'muted' },
        'Firebase não configurado neste deploy. Configure ',
        el('code', {}, 'js/firebase.js'),
        '. Use export manual abaixo enquanto isso.'
      )
    );
  }

  const user = currentUser();
  const anon = isAnonymous();
  const email = user?.email || null;

  const statusLine = !user
    ? 'Conectando.'
    : anon
      ? 'Anônima · ativa'
      : `Vinculada com Google · ${email}`;

  const lastSyncText = cloudLastSyncError
    ? `Falha no último sync: ${cloudLastSyncError}`
    : cloudLastSyncAt
      ? `Último sync: ${formatRelativeTime(cloudLastSyncAt)}`
      : 'Aguardando primeira sessão.';

  const recoveryPhrase = user ? generateRecoveryPhrase(user.uid) : '—';

  return el('div', { class: 'settings-section' },
    el('h3', {}, 'Sincronização'),
    el('p', {}, statusLine),
    el('p', { class: 'muted', style: { color: cloudLastSyncError ? 'var(--danger)' : 'var(--text-dim)' } }, lastSyncText),

    anon ? el('div', { class: 'muted', style: { background: 'var(--bg)', padding: '0.6rem 0.8rem', borderRadius: '8px', marginTop: '0.5rem', fontSize: '0.9rem' } },
      'Para usar em outro dispositivo, vincule sua conta Google. Login com o mesmo Google no outro device restaura os dados.'
    ) : null,

    el('div', { class: 'settings-row', style: { marginTop: '0.5rem' } },
      el('label', { for: 'cloudEnabled' }, 'Auto-sync após cada sessão'),
      el('input', {
        type: 'checkbox', id: 'cloudEnabled', checked: cloudEnabled,
        onchange: (e) => db.setSetting('cloudSyncEnabled', e.target.checked)
      })
    ),

    el('div', { class: 'btn-group', style: { marginTop: '0.75rem' } },
      el('button', {
        class: 'btn btn-primary',
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Sincronizando.';
          const result = await syncToCloud({ commitMessage: 'Manual sync' });
          if (result.ok) alert('Sync concluído.');
          else if (result.skipped) alert(`Sync ignorado: ${result.reason}`);
          else alert('Falha: ' + result.error);
          refresh();
        }
      }, 'Sincronizar'),

      anon ? el('button', {
        class: 'btn btn-success',
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = '...';
          try {
            await linkWithGoogle();
            await syncToCloud({ commitMessage: 'Linked Google account' });
            alert('Conta vinculada. Use o mesmo Google nos outros dispositivos.');
            refresh();
          } catch (err) {
            if (err.code === 'auth/credential-already-in-use') {
              if (confirm('Esse Google já está vinculado a outra conta. Fazer login nela e restaurar os dados? Dados locais atuais serão substituídos.')) {
                try {
                  await signInWithGoogle();
                  await restoreFromCloud();
                  alert('Restaurado. Recarregando.');
                  location.reload();
                  return;
                } catch (e2) {
                  alert('Falha ao restaurar: ' + (e2.message || e2));
                }
              }
            } else {
              alert('Falha: ' + (err.message || err));
            }
            e.target.disabled = false;
            e.target.textContent = 'Vincular Google';
          }
        }
      }, 'Vincular Google') : el('button', {
        class: 'btn btn-warning',
        onclick: async () => {
          if (!confirm('Desvincular Google deste dispositivo. Dados na nuvem permanecem intactos. Continuar?')) return;
          await signOutCurrent();
          location.reload();
        }
      }, 'Sair'),

      el('button', {
        class: 'btn',
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = '...';
          try {
            if (!confirm('Substituir dados locais com a versão da nuvem. Recomendado exportar local antes. Continuar?')) {
              e.target.disabled = false;
              e.target.textContent = 'Restaurar da nuvem';
              return;
            }
            await restoreFromCloud();
            alert('Restaurado. Recarregando.');
            location.reload();
          } catch (err) {
            alert('Falha: ' + err.message);
            e.target.disabled = false;
            e.target.textContent = 'Restaurar da nuvem';
          }
        }
      }, 'Restaurar da nuvem')
    ),

    user ? el('details', { style: { marginTop: '1rem' } },
      el('summary', { style: { cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.85rem' } }, 'Detalhes técnicos'),
      el('p', { class: 'muted', style: { fontSize: '0.85rem', marginTop: '0.5rem' } },
        'UID: ', el('code', {}, user.uid.slice(0, 12), '...'),
        el('br', {}),
        'Apelido: ', el('code', {}, recoveryPhrase)
      )
    ) : null
  );
}
