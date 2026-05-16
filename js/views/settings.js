import { el, clear } from '../utils.js';
import { db } from '../db.js';
import { exportAll, importAll, downloadJSON } from '../importExport.js';
import { getVoices, setTtsRate, setTtsVoice } from '../tts.js';
import { isConfigured as isFirebaseConfigured, currentUser } from '../firebase.js';
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

    container.appendChild(el('header', { class: 'page-title' },
      el('h1', {}, 'Configurações')
    ));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Nível'),
      el('div', { class: 'settings-row' },
        el('label', {}, 'CEFR'),
        el('span', { class: 'mono' }, String(cefrLevel).toUpperCase())
      ),
      lextaleScore != null ? el('div', { class: 'settings-row' },
        el('label', {}, 'Score LexTALE'),
        el('span', { class: 'mono' }, `${Math.round(lextaleScore)}%`)
      ) : null,
      el('div', { class: 'footer' },
        el('a', { href: '#/placement', class: 'btn btn-block' }, 'Refazer teste')
      )
    ));

    container.appendChild(el('div', { class: 'settings-section' },
      el('h3', {}, 'Limites diários'),
      el('div', { class: 'settings-row' },
        el('label', { for: 'dailyNew' }, 'Novos cards'),
        el('input', {
          type: 'number', id: 'dailyNew', value: dailyNew, min: '0', max: '200',
          onchange: (e) => db.setSetting('dailyNewCards', Number(e.target.value))
        })
      ),
      el('div', { class: 'settings-row' },
        el('label', { for: 'dailyReviews' }, 'Revisões'),
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
        el('label', { for: 'ttsRate' }, `Velocidade · ${Number(ttsRate).toFixed(1)}x`),
        el('input', {
          type: 'range', id: 'ttsRate', min: '0.5', max: '1.5', step: '0.1', value: ttsRate,
          oninput: (e) => {
            setTtsRate(Number(e.target.value));
            e.target.previousElementSibling.textContent = `Velocidade · ${Number(e.target.value).toFixed(1)}x`;
          }
        })
      ),
      voices.length > 0 ? el('div', { class: 'settings-row' },
        el('label', { for: 'ttsVoice' }, 'Voz'),
        buildVoiceSelect(voices, ttsVoice)
      ) : el('p', {}, 'Carregando vozes do sistema.'),
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
      el('div', { class: 'info' },
        'Export JSON manual. No iPhone, salve em Arquivos → iCloud Drive para acesso multi-device.'
      ),
      el('div', { class: 'settings-row' },
        el('label', {}, 'Último export'),
        el('span', { class: 'mono' },
          lastExport ? new Date(lastExport).toLocaleDateString('pt-BR') : '—'
        )
      ),
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
      el('div', { class: 'footer' },
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
      )
    ));
  }

  function buildVoiceSelect(voices, current) {
    const enVoices = voices.filter((v) => v.lang.startsWith('en'));
    const select = el('select', {
      id: 'ttsVoice',
      onchange: (e) => setTtsVoice(e.target.value)
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
      el('div', { class: 'info' },
        'Firebase não configurado neste deploy. Use export manual acima.'
      )
    );
  }

  const user = currentUser();
  const recoveryPhrase = user ? generateRecoveryPhrase(user.uid) : '—';

  const statusLine = user ? 'Backup automático · ativo' : 'Conectando.';
  const lastSyncText = cloudLastSyncError
    ? `Falha: ${cloudLastSyncError}`
    : cloudLastSyncAt
      ? formatRelativeTime(cloudLastSyncAt)
      : 'Aguardando.';

  return el('div', { class: 'settings-section' },
    el('h3', {}, 'Sincronização'),
    el('div', { class: 'settings-row' },
      el('label', {}, 'Status'),
      el('span', {}, statusLine)
    ),
    el('div', { class: 'settings-row' },
      el('label', {}, 'Último sync'),
      el('span', { style: { color: cloudLastSyncError ? 'var(--danger)' : 'var(--text-dim)' } }, lastSyncText)
    ),
    el('div', { class: 'settings-row' },
      el('label', { for: 'cloudEnabled' }, 'Auto-sync após sessão'),
      el('input', {
        type: 'checkbox', id: 'cloudEnabled', checked: cloudEnabled,
        onchange: (e) => db.setSetting('cloudSyncEnabled', e.target.checked)
      })
    ),
    el('div', { class: 'info' },
      'Cada instalação tem um UID anônimo com backup automático. Para migrar entre dispositivos, use Exportar / Importar acima.'
    ),
    el('div', { class: 'btn-group' },
      el('button', {
        class: 'btn btn-primary',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = 'Sincronizando.';
          try {
            const result = await syncToCloud({ commitMessage: 'Manual sync' });
            if (result.ok) alert('Sync concluído.');
            else if (result.skipped) alert(`Sync ignorado: ${result.reason}`);
            else alert('Falha: ' + result.error);
            refresh();
          } catch (err) {
            alert('Falha: ' + (err.message || err));
            btn.disabled = false;
            btn.textContent = 'Sincronizar';
          }
        }
      }, 'Sincronizar'),
      el('button', {
        class: 'btn',
        onclick: async (e) => {
          const btn = e.currentTarget;
          if (!confirm('Substituir dados locais com a versão da nuvem deste dispositivo. Útil só se o IndexedDB foi limpo mas o UID anônimo sobreviveu. Continuar?')) return;
          btn.disabled = true;
          btn.textContent = '...';
          try {
            await restoreFromCloud();
            alert('Restaurado. Recarregando.');
            location.reload();
          } catch (err) {
            alert('Falha: ' + (err.message || err));
            btn.disabled = false;
            btn.textContent = 'Restaurar';
          }
        }
      }, 'Restaurar')
    ),
    user ? el('details', {},
      el('summary', {}, 'Detalhes técnicos'),
      el('p', {},
        'UID: ', el('code', {}, user.uid.slice(0, 12), '...'),
        el('br', {}),
        'Apelido: ', el('code', {}, recoveryPhrase)
      )
    ) : null
  );
}
