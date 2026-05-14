import { db } from './db.js';
import { exportAll } from './importExport.js';
import { pushBackup, describeDevice, GitHubError } from './github-sync.js';

export async function syncToGitHub({ commitMessage } = {}) {
  const repo = await db.getSetting('githubRepo');
  const token = await db.getSetting('githubToken');
  if (!repo || !token) return { skipped: true, reason: 'not_configured' };

  try {
    const dump = await exportAll();
    dump.syncedAt = Date.now();
    dump.device = describeDevice();

    const msg = commitMessage || defaultCommitMessage(dump);
    const result = await pushBackup({ repo, token, data: dump, message: msg });

    await db.setSetting('githubLastSyncAt', Date.now());
    await db.setSetting('githubLastSyncSha', result.commitSha);
    await db.delete('settings', 'githubLastSyncError');

    return { ok: true, commitSha: result.commitSha, date: result.date };
  } catch (err) {
    const code = err instanceof GitHubError ? err.code : 'network';
    const msg = err.message || 'Erro desconhecido';
    await db.setSetting('githubLastSyncError', `${msg} (${code})`);
    console.warn('[sync] github push failed:', err);
    return { ok: false, error: msg, code };
  }
}

export async function isConfigured() {
  const repo = await db.getSetting('githubRepo');
  const token = await db.getSetting('githubToken');
  return Boolean(repo && token);
}

export async function shouldAutoSync() {
  if (!(await isConfigured())) return false;
  return (await db.getSetting('githubAutoSync', true)) !== false;
}

function defaultCommitMessage(dump) {
  const sessions = dump.sessions || [];
  const lastSession = sessions[sessions.length - 1];
  const date = new Date().toLocaleString('pt-BR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  if (!lastSession) return `Sync ${date}`;
  const r = lastSession.ratings || {};
  const total = lastSession.cardsReviewed || 0;
  const newCount = lastSession.newCards || 0;
  const correct = (r.good || 0) + (r.easy || 0);
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return `Sync ${date} — ${total} reviews (${newCount} new), ${accuracy}% accuracy`;
}
