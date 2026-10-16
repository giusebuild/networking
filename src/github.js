import { CONFIG } from './config.js';
import { validateNetwork } from './model.js';
export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
export const toBase64 = text => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};
export const fromBase64 = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
export class GitHub {
  constructor(token, config = CONFIG, transport = globalThis.fetch.bind(globalThis)) {
    this.token = token; this.config = config; this.transport = transport;
    this.root = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  }
  async request(path, options = {}) {
    let response;
    try {
      response = await this.transport(`https://api.github.com${path}`, {
        ...options, cache: 'no-store', credentials: 'omit', redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch (error) {
      const message = error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'GitHub non ha risposto entro 20 secondi. Riprova.'
        : 'Impossibile contattare GitHub. Riprova o verifica eventuali blocchi del browser.';
      throw new GitHubError(message, 0);
    }
    if (!response.ok) {
      const messages = {
        401: 'Accesso scaduto. Esporta le modifiche e accedi con un nuovo token.',
        403: 'GitHub ha rifiutato l’accesso: controlla permessi, scadenza del token o limite di richieste.',
        404: 'Archivio non accessibile. Verifica invito e permessi su networking-data.',
        409: 'L’archivio è cambiato: riconcilio le modifiche.',
        422: 'Salvataggio rifiutato da GitHub. Verifica permessi e protezioni del branch.',
      };
      throw new GitHubError(messages[response.status] || `GitHub non disponibile (${response.status}). Riprova.`, response.status);
    }
    return response.status === 204 ? null : response.json();
  }
  async identity() {
    const user = await this.request('/user');
    if (!Number.isSafeInteger(user.id) || !user.login) throw new Error('Identità GitHub non verificabile');
    return { id: String(user.id), login: user.login, name: user.name || user.login };
  }
  async authorize(expectedId) {
    const user = await this.identity();
    if (expectedId && user.id !== expectedId) throw new Error('Il token appartiene a un altro account. Accedi con l’identità corretta.');
    const repo = await this.request(this.root);
    if (!repo.private) throw new Error('L’archivio deve essere privato. Accesso interrotto.');
    if (!repo.permissions?.push) throw new Error('Serve accesso in scrittura a networking-data.');
    return user;
  }
  async read() {
    const c = this.config;
    const file = await this.request(`${this.root}/contents/${c.path}?ref=${encodeURIComponent(c.branch)}`);
    if (file.type !== 'file' || file.encoding !== 'base64' || !file.content || file.size > 900000) throw new Error('Archivio assente o troppo grande (massimo 900 KB).');
    return { data: validateNetwork(JSON.parse(fromBase64(file.content))), sha: file.sha };
  }
  async write(data, sha) {
    validateNetwork(data);
    const content = JSON.stringify(data, null, 2) + '\n';
    if (new TextEncoder().encode(content).length > 900000) throw new Error('Archivio oltre 900 KB. Esporta i dati e riduci le note.');
    const result = await this.request(`${this.root}/contents/${this.config.path}`, {
      method: 'PUT', body: JSON.stringify({ message: 'Aggiorna rete da Networking', content: toBase64(content), sha, branch: this.config.branch }),
    });
    return result.content.sha;
  }
}
