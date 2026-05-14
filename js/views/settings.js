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
      el('a', { href: '#/', style: { color: 'var(--text-dim)', textDecoration: 'none' } }, '← Voltar'),
      el('h1', {}, 'Configurações')
    ));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Nível'),
      el('div', { class: 'settings-row' },
        el('label', {}, 'CEFR atual'),
        el('span', {}, String(cefrLevel).toUpperCase())
      ),
      lextaleScore != null ? el('div', { class: 'settings-row' },
        el('label', {}, 'LexTALE score'),
        el('span', {}, `${Math.round(lextaleScore)}%`)
      ) : null,
      el('a', { href: '#/placement', class: 'btn btn-block', style: { marginTop: '0.5rem' } }, 'Refazer teste de nivelamento')
    ));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Limites diários'),
      el('div', { class: 'settings-row' },
        el('label', { for: 'dailyNew' }, 'Cards novos por dia'),
        el('input', {
          type: 'number', id: 'dailyNew', value: dailyNew, min: '0', max: '200',
          onchange: (e) => db.setSetting('dailyNewCards', Number(e.target.value))
        })
      ),
      el('div', { class: 'settings-row' },
        el('label', { for: 'dailyReviews' }, 'Revisões por dia'),
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
      ) : el('p', { class: 'muted' }, 'Carregando vozes do sistema...'),
      el('div', { class: 'settings-row' },
        el('label', { for: 'autoplay' }, 'Reproduzir automaticamente'),
        el('input', {
          type: 'checkbox', id: 'autoplay', checked: audioAutoplay,
          onchange: (e) => db.setSetting('audioAutoplay', e.target.checked)
        })
      )
    ));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Backup'),
      el('p', { class: 'muted', style: { marginBottom: '0.75rem' } },
        '💡 No iPhone: ao exportar, escolha "Salvar em Arquivos → iCloud Drive" para acessar o backup de qualquer device. No outro celular, importe o mesmo arquivo do iCloud.'
      ),
      lastExport ? el('p', { class: 'muted' }, `Último export: ${new Date(lastExport).toLocaleDateString('pt-BR')}`) : el('p', { class: 'muted' }, 'Você ainda não fez nenhum backup.'),
      el('div', { class: 'btn-group' },
        el('button', {
          class: 'btn btn-primary',
          onclick: async () => {
            const json = await exportAll();
            downloadJSON(json, `matcards-backup-${new Date().toISOString().slice(0, 10)}.json`);
            await db.setSetting('lastExportAt', Date.now());
            refresh();
          }
        }, '⬇️ Exportar'),
        el('label', { class: 'btn' },
          '⬆️ Importar',
          el('input', {
            type: 'file', accept: '.json', style: { display: 'none' },
            onchange: async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              if (!confirm('Importar substitui todos os dados atuais. Continuar?')) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text);
                await importAll(data);
                alert('Importado com sucesso. A página será recarregada.');
                location.hash = '#/';
                location.reload();
              } catch (err) {
                alert('Erro ao importar: ' + err.message);
              }
            }
          })
        )
      )
    ));

    container.appendChild(buildCloudSection({ cloudEnabled, cloudLastSyncAt, cloudLastSyncError, refresh }));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Zona de perigo'),
      el('button', {
        class: 'btn btn-danger btn-block',
        onclick: async () => {
          if (!confirm('Apagar TODOS os dados (decks, cards, progresso, configurações)? Isso é irreversível.')) return;
          if (!confirm('Tem certeza absoluta?')) return;
          await db.resetAll();
          location.hash = '#/';
          location.reload();
        }
      }, 'Apagar todos os dados')
    ));
  }

  function buildVoiceSelect(voices, current) {
    const enVoices = voices.filter((v) => v.lang.startsWith('en'));
    const select = el('select', {
      id: 'ttsVoice',
      onchange: (e) => db.setSetting('ttsVoice', e.target.value)
    });
    select.appendChild(el('option', { value: '' }, 'Auto (padrão do sistema)'));
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
  if (mins < 1) return 'agora mesmo';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

function buildCloudSection({ cloudEnabled, cloudLastSyncAt, cloudLastSyncError, refresh }) {
  if (!isFirebaseConfigured()) {
    return el('div', { class: 'settings-section' },
      el('h3', {}, '☁️ Sincronização'),
      el('p', { class: 'muted' },
        'Firebase não configurado neste deploy. O administrador precisa colar a config em ',
        el('code', {}, 'js/firebase.js'),
        '. Por enquanto, use o Export manual abaixo para backup.'
      )
    );
  }

  const user = currentUser();
  const anon = isAnonymous();
  const email = user?.email || null;

  const statusLine = !user
    ? '⏳ Conectando...'
    : anon
      ? '✓ Sincronização anônima ativa'
      : `✓ Vinculada com Google · ${email}`;

  const lastSyncText = cloudLastSyncError
    ? `⚠️ Último sync falhou: ${cloudLastSyncError}`
    : cloudLastSyncAt
      ? `Último sync: ${formatRelativeTime(cloudLastSyncAt)}`
      : 'Aguardando primeira sessão pra sincronizar';

  const recoveryPhrase = user ? generateRecoveryPhrase(user.uid) : '—';

  return el('div', { class: 'settings-section' },
    el('h3', {}, '☁️ Sincronização'),
    el('p', {}, statusLine),
    el('p', { class: 'muted', style: { color: cloudLastSyncError ? 'var(--danger)' : 'var(--text-dim)' } }, lastSyncText),

    anon ? el('div', { class: 'muted', style: { background: 'var(--bg)', padding: '0.6rem 0.8rem', borderRadius: '8px', marginTop: '0.5rem', fontSize: '0.9rem' } },
      el('strong', {}, '💡 Pra usar em outro celular: '),
      'vincule sua conta com Google. Aí no outro device, faz login com Google → seus dados voltam.'
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
          e.target.textContent = 'Sincronizando...';
          const result = await syncToCloud({ commitMessage: 'Manual sync' });
          if (result.ok) alert('✓ Sincronizado');
          else if (result.skipped) alert(`Sync pulado: ${result.reason}`);
          else alert('Erro: ' + result.error);
          refresh();
        }
      }, '🔄 Sincronizar agora'),

      anon ? el('button', {
        class: 'btn btn-success',
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = '...';
          try {
            await linkWithGoogle();
            await syncToCloud({ commitMessage: 'Linked Google account' });
            alert('✓ Conta vinculada! Agora use o mesmo Google em outros devices.');
            refresh();
          } catch (err) {
            if (err.code === 'auth/credential-already-in-use') {
              if (confirm('Esse Google já está vinculado a outra conta. Quer fazer login nela e RESTAURAR aqueles dados? (Dados atuais deste device serão substituídos)')) {
                try {
                  await signInWithGoogle();
                  await restoreFromCloud();
                  alert('✓ Restaurado. Recarregando.');
                  location.reload();
                  return;
                } catch (e2) {
                  alert('Erro ao restaurar: ' + (e2.message || e2));
                }
              }
            } else {
              alert('Erro: ' + (err.message || err));
            }
            e.target.disabled = false;
            e.target.textContent = '🔗 Vincular Google';
          }
        }
      }, '🔗 Vincular Google') : el('button', {
        class: 'btn btn-warning',
        onclick: async () => {
          if (!confirm('Desvincular Google? Você voltará a uma conta anônima neste device. Dados na nuvem permanecem.')) return;
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
            if (!confirm('Baixar dados da nuvem e substituir os locais? Faça um Export local antes se quiser segurança.')) {
              e.target.disabled = false;
              e.target.textContent = '⬇️ Restaurar da nuvem';
              return;
            }
            await restoreFromCloud();
            alert('✓ Restaurado da nuvem. Recarregando.');
            location.reload();
          } catch (err) {
            alert('Erro: ' + err.message);
            e.target.disabled = false;
            e.target.textContent = '⬇️ Restaurar da nuvem';
          }
        }
      }, '⬇️ Restaurar da nuvem')
    ),

    user ? el('details', { style: { marginTop: '1rem' } },
      el('summary', { style: { cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.85rem' } }, 'Detalhes técnicos'),
      el('p', { class: 'muted', style: { fontSize: '0.85rem', marginTop: '0.5rem' } },
        'ID do device: ', el('code', {}, user.uid.slice(0, 12), '...'),
        el('br', {}),
        'Apelido: ', el('code', {}, recoveryPhrase)
      )
    ) : null
  );
}
