import { CATALOG, suggestedTags, needTags } from './profile.js';
import { tagKey as norm, uniqueTags, tagEntries } from './tags.js';
const keys = ['skills', 'markets', 'interests'];
const labels = { skills: 'Competenza', markets: 'Settore', interests: 'Interesse' };
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const blank = () => Object.fromEntries(keys.map(k => [k, []]));
export class SmartTags {
  constructor(root, intent = 'offer') {
    this.root = root; this.intent = intent;
    root.innerHTML = `<div class="rs-smart-row"><div class="rs-smart-selected" aria-label="${intent === 'need' ? 'Tag della richiesta' : 'Tag del contributo'}"></div><button type="button" class="rs-add-tag rs-smart-toggle" aria-label="Aggiungi o modifica tag" aria-expanded="false">+</button></div><div class="rs-smart-add" hidden><input type="text" maxlength="80" autocomplete="off" placeholder="Aggiungi un tag…" aria-label="Nuovo tag ${intent === 'need' ? 'della richiesta' : 'del contributo'}"><select aria-label="Tipo di tag"><option value="">Automatico</option><option value="skills">Competenza</option><option value="markets">Settore</option>${intent === 'offer' ? '<option value="interests">Interesse</option>' : ''}</select><button type="button" class="rs-btn rs-smart-commit">Aggiungi</button></div><span class="rs-tag-error" role="status"></span>`;
    this.input = root.querySelector('input'); this.set();
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.smartKey) {
        const value = norm(b.dataset.smartValue);
        for (const k of keys) { this.blocked.add(`${k}:${value}`); this.manual[k] = this.manual[k].filter(x => norm(x) !== value); }
        this.root.querySelector('.rs-tag-error').textContent = ''; this.render(); this.root.querySelector('.rs-smart-toggle').focus({ preventScroll: true });
      }
      else if (b.classList.contains('rs-smart-toggle')) { const box = root.querySelector('.rs-smart-add'); box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) this.input.focus(); }
      else if (b.classList.contains('rs-smart-commit')) this.commit();
    });
    this.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.commit(); } });
  }
  set(tags = {}, pool = {}) {
    this.manual = Object.fromEntries(keys.map(k => [k, uniqueTags(tags[k] || [])])); this.auto = blank(); this.pool = pool; this.blocked = new Set(); this.input.value = '';
    this.root.querySelector('.rs-tag-error').textContent = '';
    this.root.querySelector('.rs-smart-add').hidden = true; this.root.querySelector('.rs-smart-toggle').setAttribute('aria-expanded', 'false'); this.render();
  }
  update(text, suggestions = {}) { this.auto = this.intent === 'need' ? needTags(text, this.pool) : suggestedTags(text, this.pool); if (this.intent !== 'need') for (const k of keys) this.auto[k] = uniqueTags([...this.auto[k], ...(suggestions[k] || [])]); this.render(); }
  get values() { return Object.fromEntries(keys.map(k => [k, uniqueTags([...this.manual[k], ...(this.auto[k] || [])].filter(x => !this.blocked.has(`${k}:${norm(x)}`))).slice(0, 40)])); }
  commit() {
    const value = this.input.value.trim().slice(0, 80); if (!value) return;
    const k = this.root.querySelector('select').value || keys.filter(k => this.intent === 'offer' || k !== 'interests').find(k => [...CATALOG[k], ...(this.pool[k] || [])].some(x => norm(x) === norm(value))) || 'skills';
    if (this.values[k].length >= 40 && !this.values[k].some(x => norm(x) === norm(value))) { this.root.querySelector('.rs-tag-error').textContent = 'Massimo 40 tag per tipo.'; return; }
    this.manual[k].push(value); for (const key of keys) this.blocked.delete(`${key}:${norm(value)}`);
    this.input.value = ''; this.root.querySelector('.rs-tag-error').textContent = ''; this.render(); this.input.focus();
  }
  render() {
    const values = this.values;
    this.root.querySelector('.rs-smart-selected').innerHTML = tagEntries(values).map(({ value, categories }) => `<button type="button" class="rs-selected-chip" data-smart-key="${categories[0]}" data-smart-value="${esc(value)}" title="${categories.map(k => labels[k]).join(' · ')}" aria-label="Rimuovi tag: ${esc(value)}">${esc(value)}<span aria-hidden="true">×</span></button>`).join('');
  }
}
