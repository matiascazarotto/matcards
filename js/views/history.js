import { el, clear } from '../utils.js';
import { db } from '../db.js';
import { listHistory, getCommitContent } from '../github-sync.js';
import { importAll } from '../importExport.js';

export async function renderHistory(app) {
  const container = el('div', { class: 'view' });
  app.appendChild(container);

  const repo = await db.getSetting('githubRepo');
  const token = await db.getSetting('githubToken');

  container.appendChild(el('header', { class: 'app-header' },
    el('a', { href: '#/settings', style: { color: 'var(--text-dim)', textDecoration: 'none' } }, '← Configurações'),
    el('h1', {}, 'Histórico de sync')
  ));

  if (!repo || !token) {
    container.appendChild(el('div', { class: 'card-hero' },
      el('h2', {}, 'Sync GitHub não configurado'),
      el('p', {}, 'Configure o sync em Configurações antes de acessar o histórico.'),
      el('a', { href: '#/settings', class: 'btn btn-primary' }, 'Ir para Configurações')
    ));
    return;
  }

  const loading = el('p', { class: 'muted' }, 'Carregando histórico.');
  container.appendChild(loading);

  let commits;
  try {
    commits = await listHistory({ repo, token, limit: 30 });
  } catch (err) {
    loading.remove();
    container.appendChild(el('div', { class: 'card' },
      el('h3', {}, 'Falha ao carregar histórico'),
      el('p', { class: 'muted' }, err.message),
      el('a', { href: '#/settings', class: 'btn' }, 'Configurações')
    ));
    return;
  }

  loading.remove();

  if (commits.length === 0) {
    container.appendChild(el('div', { class: 'card-hero' },
      el('h2', {}, 'Nenhum sync registrado'),
      el('p', { class: 'muted' }, 'Conclua uma sessão de estudo para gerar o primeiro commit de backup.')
    ));
    return;
  }

  container.appendChild(el('p', { class: 'muted', style: { marginBottom: '1rem' } },
    `${commits.length} commits em ${repo}. Restauração reverte todo o estado local para o ponto selecionado.`
  ));

  const list = el('div', { class: 'deck-list' });

  commits.forEach((commit) => {
    const date = new Date(commit.date);
    const dateStr = date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const shortSha = commit.sha.slice(0, 7);
    const summary = (commit.message || '').split('\n')[0];

    list.appendChild(el('div', { class: 'deck-item' },
      el('div', { class: 'deck-item-info' },
        el('div', { class: 'deck-item-name' }, summary),
        el('div', { class: 'deck-item-stats' }, `${dateStr} · ${shortSha}`)
      ),
      el('button', {
        class: 'btn',
        onclick: async (e) => {
          if (!confirm(`Restaurar estado para esse commit?\n\n"${summary}"\n\nSubstitui todos os dados locais. Recomendado exportar backup local antes (Configurações → Exportar).`)) return;
          e.target.disabled = true;
          e.target.textContent = 'Restaurando.';
          try {
            const data = await getCommitContent({ repo, token, sha: commit.sha });
            await importAll(data);
            alert('Restaurado. Recarregando.');
            location.hash = '#/';
            location.reload();
          } catch (err) {
            alert('Falha ao restaurar: ' + err.message);
            e.target.disabled = false;
            e.target.textContent = 'Restaurar';
          }
        }
      }, 'Restaurar')
    ));
  });

  container.appendChild(list);
}
