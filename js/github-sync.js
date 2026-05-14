/**
 * GitHub-as-database wrapper.
 *
 * Uses GitHub Contents API to read/write a single `backup.json` file in a
 * user-owned private repository. Authenticated with a Fine-grained Personal
 * Access Token scoped only to that repo with Contents: Read and write.
 *
 * Each push is a commit, giving free version history.
 */

const API_BASE = 'https://api.github.com';
const DEFAULT_PATH = 'backup.json';

export class GitHubError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.code = code;
  }
}
export class GitHubAuthError extends GitHubError {
  constructor(msg) { super(msg, 401, 'auth'); this.name = 'GitHubAuthError'; }
}
export class GitHubPermissionError extends GitHubError {
  constructor(msg) { super(msg, 403, 'permission'); this.name = 'GitHubPermissionError'; }
}
export class GitHubNotFoundError extends GitHubError {
  constructor(msg) { super(msg, 404, 'not_found'); this.name = 'GitHubNotFoundError'; }
}
export class GitHubConflictError extends GitHubError {
  constructor(msg) { super(msg, 409, 'conflict'); this.name = 'GitHubConflictError'; }
}
export class GitHubRateLimitError extends GitHubError {
  constructor(msg, resetAt) { super(msg, 403, 'rate_limit'); this.resetAt = resetAt; this.name = 'GitHubRateLimitError'; }
}

export function parseRepoSpec(spec) {
  if (!spec || typeof spec !== 'string') throw new Error('Repo vazio');
  let s = spec.trim();
  s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//, '');
  s = s.replace(/^github\.com\//, '');
  s = s.replace(/\.git$/, '');
  s = s.replace(/\/$/, '');
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error(`Formato inválido. Use "owner/repo" (recebido: "${spec}")`);
  return { owner: parts[0], repo: parts[1] };
}

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (!navigator.onLine) {
      throw new GitHubError('Sem internet. Conecte ao Wi-Fi/dados e tente novamente.', 0, 'offline');
    }
    throw new GitHubError(
      `Não consegui contactar api.github.com. Possíveis causas: (1) extensão de browser bloqueando, (2) VPN/firewall, (3) cache antigo do Service Worker — tente Cmd/Ctrl+Shift+R. Erro original: ${err.message}`,
      0,
      'network'
    );
  }
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function b64decode(str) {
  const binary = atob(str.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function handleError(response, defaultMessage) {
  let body = null;
  try { body = await response.json(); } catch {}
  const msg = (body && body.message) || defaultMessage;

  if (response.status === 401) throw new GitHubAuthError(`Token inválido ou expirado (${msg})`);

  if (response.status === 403) {
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      const resetAt = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      throw new GitHubRateLimitError(`Rate limit do GitHub atingido. Tente novamente em ${new Date(resetAt).toLocaleTimeString('pt-BR')}`, resetAt);
    }
    throw new GitHubPermissionError(`Sem permissão (${msg}). Verifique se o token tem "Contents: Read and write" no repo.`);
  }

  if (response.status === 404) throw new GitHubNotFoundError(msg);
  if (response.status === 409 || response.status === 422) throw new GitHubConflictError(msg);

  throw new GitHubError(`${msg} (HTTP ${response.status})`, response.status);
}

export async function testConnection({ repo, token }) {
  const { owner, repo: name } = parseRepoSpec(repo);
  const response = await safeFetch(`${API_BASE}/repos/${owner}/${name}`, {
    headers: apiHeaders(token)
  });
  if (!response.ok) await handleError(response, 'Falha ao acessar o repo');
  const data = await response.json();
  return {
    name: data.full_name,
    private: data.private,
    defaultBranch: data.default_branch,
    permissions: data.permissions
  };
}

export async function getCurrentSha({ repo, token, path = DEFAULT_PATH }) {
  const { owner, repo: name } = parseRepoSpec(repo);
  const url = `${API_BASE}/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`;
  const response = await safeFetch(url, { headers: apiHeaders(token) });
  if (response.status === 404) return null;
  if (!response.ok) await handleError(response, 'Falha ao buscar SHA atual');
  const data = await response.json();
  return data.sha;
}

export async function pushBackup({ repo, token, data, message, path = DEFAULT_PATH }) {
  const { owner, repo: name } = parseRepoSpec(repo);
  const url = `${API_BASE}/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`;
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const content = b64encode(json);

  async function doPut(sha) {
    const body = { message: message || `Sync ${new Date().toISOString()}`, content };
    if (sha) body.sha = sha;
    return safeFetch(url, {
      method: 'PUT',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  let sha = await getCurrentSha({ repo, token, path });
  let response = await doPut(sha);

  if (response.status === 409 || response.status === 422) {
    sha = await getCurrentSha({ repo, token, path });
    response = await doPut(sha);
  }

  if (!response.ok) await handleError(response, 'Falha ao escrever backup');
  const result = await response.json();
  return {
    commitSha: result.commit?.sha,
    contentSha: result.content?.sha,
    date: result.commit?.committer?.date || new Date().toISOString()
  };
}

export async function pullBackup({ repo, token, path = DEFAULT_PATH }) {
  const { owner, repo: name } = parseRepoSpec(repo);
  const url = `${API_BASE}/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`;
  const response = await safeFetch(url, { headers: apiHeaders(token) });
  if (response.status === 404) throw new GitHubNotFoundError('backup.json ainda não existe nesse repo. Faça um push primeiro.');
  if (!response.ok) await handleError(response, 'Falha ao ler backup');
  const meta = await response.json();
  const json = b64decode(meta.content);
  return JSON.parse(json);
}

export async function listHistory({ repo, token, path = DEFAULT_PATH, limit = 20 }) {
  const { owner, repo: name } = parseRepoSpec(repo);
  const params = new URLSearchParams({ path, per_page: String(limit) });
  const url = `${API_BASE}/repos/${owner}/${name}/commits?${params}`;
  const response = await safeFetch(url, { headers: apiHeaders(token) });
  if (!response.ok) await handleError(response, 'Falha ao listar histórico');
  const commits = await response.json();
  return commits.map((c) => ({
    sha: c.sha,
    date: c.commit?.committer?.date || c.commit?.author?.date,
    message: c.commit?.message || '',
    author: c.commit?.author?.name || ''
  }));
}

export async function getCommitContent({ repo, token, sha, path = DEFAULT_PATH }) {
  const { owner, repo: name } = parseRepoSpec(repo);
  const params = new URLSearchParams({ ref: sha });
  const url = `${API_BASE}/repos/${owner}/${name}/contents/${encodeURIComponent(path)}?${params}`;
  const response = await safeFetch(url, { headers: apiHeaders(token) });
  if (!response.ok) await handleError(response, 'Falha ao buscar conteúdo do commit');
  const meta = await response.json();
  return JSON.parse(b64decode(meta.content));
}

export function describeDevice() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isMac = /Macintosh/.test(ua);
  const isWin = /Windows/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let platform = 'Browser';
  if (isIOS) platform = 'iPhone';
  else if (isMac) platform = 'Mac';
  else if (isWin) platform = 'Windows';
  const mode = isStandalone ? 'PWA' : 'Safari/Chrome';
  return `${platform} (${mode})`;
}
