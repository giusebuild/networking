import { CATALOG, suggestedTags, needTags } from './profile.js';
const keys = ['skills', 'markets', 'interests'];
const labels = { skills: 'Competenza', markets: 'Settore', interests: 'Interesse' };
const norm = x => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const blank = () => Object.fromEntries(keys.map(k => [k, []]));
export class SmartTags {
  constructor(root, intent = 'offer') {
    this.root = root; this.intent = intent;
    root.innerHTML = `<div class="rs-smart-row"><div class="rs-smart-selected" aria-label="${intent === 'need' ? 'Tag della richiesta' : 'Tag del contributo'}"></div><button type="button" class="rs-add-tag rs-smart-toggle" aria-label="Aggiungi o modifica tag" aria-expanded="false">+</button></div><div class="rs-smart-add" hidden><input type="text" maxlength="80" autocomplete="off" placeholder="Aggiungi un tag…" aria-label="Nuovo tag ${intent === 'need' ? 'della richiesta' : 'del contributo'}"><select aria-label="Tipo di tag"><option value="">Automatico</option><option value="skills">Competenza</option><option value="markets">Settore</option>${intent === 'offer' ? '<option value="interests">Interesse</option>' : ''}</select><button type="button" class="rs-btn rs-smart-commit">Aggiungi</button></div><span class="rs-tag-error" role="status"></span>`;
    this.input = root.querySelector('input'); this.set();
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.smartKey) { const k = b.dataset.smartKey, v = b.dataset.smartValue; this.blocked.add(`${k}:${norm(v)}`); this.manual[k] = this.manual[k].filter(x => norm(x) !== norm(v)); this.render(); this.root.querySelector('.rs-smart-toggle').focus({ preventScroll: true }); }
      else if (b.classList.contains('rs-smart-toggle')) { const box = root.querySelector('.rs-smart-add'); box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) this.input.focus(); }
      else if (b.classList.contains('rs-smart-commit')) this.commit();
    });
    this.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.commit(); } });
  }
  set(tags = {}, pool = {}) {
    this.manual = Object.fromEntries(keys.map(k => [k, [...new Set(tags[k] || [])]])); this.auto = blank(); this.pool = pool; this.blocked = new Set(); this.input.value = '';
    this.root.querySelector('.rs-smart-add').hidden = true; this.root.querySelector('.rs-smart-toggle').setAttribute('aria-expanded', 'false'); this.render();
  }
  update(text) { this.auto = this.intent === 'need' ? needTags(text, this.pool) : suggestedTags(text, this.pool); this.render(); }
  get values() { return Object.fromEntries(keys.map(k => [k, [...new Map([...this.manual[k], ...(this.auto[k] || [])].filter(x => !this.blocked.has(`${k}:${norm(x)}`)).map(x => [norm(x), x])).values()].slice(0, 40)])); }
  commit() {
    const value = this.input.value.trim().slice(0, 80); if (!value) return;
    const k = this.root.querySelector('select').value || keys.filter(k => this.intent === 'offer' || k !== 'interests').find(k => [...CATALOG[k], ...(this.pool[k] || [])].some(x => norm(x) === norm(value))) || 'skills';
    if (this.values[k].length >= 40) { this.root.querySelector('.rs-tag-error').textContent = 'Massimo 40 tag per tipo.'; return; }
    this.manual[k].push(value); this.blocked.delete(`${k}:${norm(value)}`); this.input.value = ''; this.root.querySelector('.rs-tag-error').textContent = ''; this.render(); this.input.focus();
  }
  render() {
    const values = this.values;
    this.root.querySelector('.rs-smart-selected').innerHTML = keys.flatMap(k => values[k].map(v => `<button type="button" class="rs-selected-chip" data-smart-key="${k}" data-smart-value="${esc(v)}" title="${labels[k]}" aria-label="Rimuovi ${labels[k].toLowerCase()}: ${esc(v)}">${esc(v)}<span aria-hidden="true">×</span></button>`)).join('');
  }
}
