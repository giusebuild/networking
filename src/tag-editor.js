import { CATALOG } from './profile.js';
const norm = x => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unique = xs => [...new Map(xs.filter(Boolean).map(x => [norm(x), x])).values()];
export class TagEditor {
  constructor(root, key, label) {
    this.root = root; this.key = key; this.label = label; this.values = []; this.pool = []; this.suggested = [];
    root.innerHTML = `<div class="rs-chip-field"><div class="rs-selected-tags" aria-label="${label} selezionati"></div><div class="rs-chip-entry"><input id="tags-${key}" type="text" maxlength="80" autocomplete="off" aria-label="Cerca o aggiungi: ${label}" placeholder="Cerca o aggiungi"><button type="button" class="rs-chip-add" aria-label="Aggiungi tag a ${label}" hidden>+</button></div></div><div class="rs-tag-options" role="group" aria-label="Suggerimenti: ${label}"></div><span class="rs-tag-error" role="status"></span>`;
    this.input = root.querySelector('input');
    this.input.addEventListener('input', () => this.renderOptions());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.commit(); }
      if (e.key === 'Escape' && this.input.value) { e.stopPropagation(); this.input.value = ''; this.renderOptions(); }
    });
    root.addEventListener('click', e => {
      const button = e.target.closest('button'); if (!button) return;
      if (button.dataset.tagRemove !== undefined) { this.values.splice(Number(button.dataset.tagRemove), 1); this.render(); }
      else if (button.dataset.tagValue !== undefined) this.add(button.dataset.tagValue);
      else if (button.classList.contains('rs-chip-add')) this.commit();
    });
    this.render();
  }
  set(values = [], pool = [], suggested = []) {
    this.values = unique(values); this.pool = unique([...pool, ...CATALOG[this.key]]); this.suggested = unique(suggested);
    this.input.value = ''; this.render();
  }
  suggest(values = []) { this.suggested = unique(values); this.renderOptions(); }
  add(value) {
    const text = String(value || '').trim().slice(0, 80);
    if (!text) return;
    if (this.values.length >= 40) { this.root.querySelector('.rs-tag-error').textContent = 'Puoi aggiungere fino a 40 tag.'; return; }
    if (!this.values.some(v => norm(v) === norm(text))) this.values.push(this.pool.find(v => norm(v) === norm(text)) || text);
    this.input.value = ''; this.root.querySelector('.rs-tag-error').textContent = ''; this.render(); this.input.focus();
  }
  commit() { const pending = this.input.value; for (const text of pending.split(/[,;\n]/)) this.add(text); }
  render() {
    this.root.querySelector('.rs-selected-tags').innerHTML = this.values.map((v, i) => `<button type="button" class="rs-selected-chip" data-tag-remove="${i}" aria-label="Rimuovi ${esc(v)}">${esc(v)}<span aria-hidden="true">×</span></button>`).join('');
    this.input.placeholder = this.values.length ? 'Aggiungi…' : 'Cerca o scegli qui sotto';
    this.renderOptions();
  }
  renderOptions() {
    const term = norm(this.input.value.trim());
    const candidates = unique([...this.suggested, ...this.pool]).filter(v => !this.values.some(x => norm(x) === norm(v)) && (!term || norm(v).includes(term))).slice(0, term ? 7 : 5);
    this.root.querySelector('.rs-chip-add').hidden = !term;
    this.root.querySelector('.rs-tag-options').innerHTML = candidates.map(v => `<button type="button" class="rs-suggested-chip" data-tag-value="${esc(v)}"><span aria-hidden="true">+</span>${esc(v)}</button>`).join('');
  }
}
