import { clone, equal, mergeNetworks, resolveConflicts, validateNetwork } from './model.js?v=3';
export class NetworkSync {
  constructor(api, state, notify = () => {}) {
    this.api = api; this.base = clone(state.base); this.local = clone(state.local); this.sha = state.sha;
    this.notify = notify; this.running = null; this.pending = state.pending ? clone(state.pending) : null; this.status = this.pending ? 'conflict' : 'idle'; this.error = null;
  }
  get dirty() { return !equal(this.base, this.local); }
  snapshot() { return { base: this.base, local: this.local, sha: this.sha, pending: this.pending }; }
  emit() { this.notify(this); }
  edit(mutator, original = this.local) {
    if (this.pending) throw new Error('Risolvi prima le modifiche in conflitto.');
    const draft = clone(original); mutator(draft); validateNetwork(draft);
    const merged = mergeNetworks(original, draft, this.local);
    if (merged.conflicts.length) {
      this.pending = { ...merged, remote: clone(this.local), sha: this.sha, source: 'edit' };
      this.status = 'conflict';
    } else this.local = validateNetwork(merged.data);
    this.emit();
  }
  import(data) {
    if (this.pending) throw new Error('Risolvi prima le modifiche in conflitto.');
    const result = mergeNetworks({ schemaVersion: 1, members: {}, people: {}, contributions: {}, relationships: {} }, this.local, data);
    if (result.conflicts.length) {
      this.pending = { ...result, remote: clone(data), sha: this.sha, source: 'import' };
      this.status = 'conflict';
    } else this.local = validateNetwork(result.data);
    this.emit();
  }
  resolve(choices) {
    const p = this.pending;
    if (!p) return;
    const data = resolveConflicts(p.data, p.conflicts, choices);
    if (p.source === 'sync') { this.base = p.remote; this.sha = p.sha; }
    this.local = data; this.pending = null; this.status = 'idle'; this.emit();
  }
  sync() {
    if (this.running) return this.running;
    if (this.pending) return Promise.resolve();
    this.running = this.perform().finally(() => { this.running = null; this.emit(); });
    return this.running;
  }
  async perform() {
    this.status = 'syncing'; this.error = null; this.emit();
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await this.api.read();
        if (this.pending) { this.status = 'conflict'; return; }
        const result = mergeNetworks(this.base, this.local, remote.data);
        if (result.conflicts.length) {
          this.pending = { ...result, remote: remote.data, sha: remote.sha, source: 'sync' };
          this.status = 'conflict'; this.emit(); return;
        }
        this.local = validateNetwork(result.data); this.base = clone(remote.data); this.sha = remote.sha; this.emit();
        if (!this.dirty) { this.status = 'saved'; return; }
        const submitted = clone(this.local);
        try {
          const sha = await this.api.write(submitted, this.sha);
          this.base = submitted; this.sha = sha;
          if (this.pending) { this.status = 'conflict'; return; }
          if (!this.dirty) { this.status = 'saved'; return; }
        } catch (error) {
          if (![409, 422].includes(error.status)) throw error;
          if (attempt === 3) throw error;
        }
      }
      this.status = 'idle';
    } catch (error) { this.status = 'error'; this.error = error; }
  }
}
