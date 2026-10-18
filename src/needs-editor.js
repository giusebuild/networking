import { SmartTags } from './smart-tags.js';
import { icon } from './icons.js';
import { refreshTextareaSizes } from './textarea-size.js';
import { MAX_NEEDS, needsMap, profileNeeds, declaredNeeds, validateNeeds } from './needs.js';

const placeholders = ['Es. Uno studio a Cagliari due pomeriggi a settimana', 'Es. Presentazioni a titolari di studi medici', 'Es. Un videomaker con cui collaborare'];
export class NeedsEditor {
  constructor(root, { self = false, canClose = false } = {}) {
    this.root = root; this.self = self; this.canClose = canClose;
    root.innerHTML = '<p class="rs-field-hint rs-needs-guide"></p><div class="rs-needs-active"></div><button type="button" class="rs-text-btn rs-needs-add">'+icon('plus')+'Aggiungi richiesta</button><details class="rs-needs-resolved" hidden><summary><span class="rs-needs-archive-label"></span> <span class="rs-needs-archive-count"></span></summary><div></div></details><p class="rs-field-hint rs-needs-error" role="status"></p>';
    this.active = root.querySelector('.rs-needs-active'); this.resolved = root.querySelector('details'); this.addButton = root.querySelector('.rs-needs-add');
    this.addButton.addEventListener('click', () => this.next());
    this.set();
  }
  setSelf(self, canClose = self) { this.self = self; this.canClose = canClose; this.arrange(); }
  set(contribution = {}) {
    this.base = needsMap(contribution); this.rows = []; this.active.replaceChildren(); this.resolved.querySelector('div').replaceChildren(); this.resolved.open = false; this.root.querySelector('.rs-needs-error').textContent = '';
    for (const [id, need] of Object.entries(this.base)) if (need) this.add(need, id);
    if (!this.rows.some(r => r.status === 'active')) this.add();
    this.arrange();
  }
  setProfile(profile = {}) { this.set({ needs: declaredNeeds(profile, new Date().toISOString()) }); }
  add(need = {}, id = crypto.randomUUID()) {
    const el = document.createElement('div'); el.className = 'rs-need-item';
    el.innerHTML = '<button type="button" class="rs-need-preview"><span></span>'+icon('pencil')+'</button><div class="rs-need-edit"><label class="rs-sr"></label><textarea class="rs-field" maxlength="1500" rows="2" enterkeyhint="next"></textarea><div class="rs-need-item-tags"></div><div class="rs-need-item-tools"><button type="button" class="rs-text-btn rs-need-toggle"></button><button type="button" class="rs-text-btn rs-need-remove">'+icon('x')+'Rimuovi</button></div></div>';
    const input = el.querySelector('textarea'); input.id = `${this.root.id}-${id}`; input.placeholder = placeholders[this.rows.length % placeholders.length]; input.value = need.text || '';
    el.querySelector('label').htmlFor = input.id;
    const tags = new SmartTags(el.querySelector('.rs-need-item-tags'), 'need'); tags.set(need); tags.update(input.value);
    const row = { id, el, input, tags, status: need.status || 'active', open: !need.text }; this.rows.push(row);
    input.addEventListener('input', () => { tags.update(input.value); this.arrangeLabels(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (input.value.trim()) this.next(); } });
    el.querySelector('.rs-need-preview').addEventListener('click', () => { const open = !row.open; this.rows.forEach(r => r.open = false); row.open = open; this.arrange(); if (open) input.focus(); });
    el.querySelector('.rs-need-toggle').addEventListener('click', () => {
      if (!input.value.trim() || (row.status === 'active' && !this.canClose)) return;
      row.status = row.status === 'active' ? 'resolved' : 'active'; row.open = false; this.arrange();
      if (!this.rows.some(r => r.status === 'active')) this.add();
    });
    el.querySelector('.rs-need-remove').addEventListener('click', () => { this.rows = this.rows.filter(r => r !== row); el.remove(); if (!this.rows.some(r => r.status === 'active')) this.add(); this.arrange(); });
    this.arrange(); return row;
  }
  arrangeLabels() {
    this.addButton.disabled = this.rows.filter(r => r.input.value.trim()).length >= MAX_NEEDS;
    this.rows.forEach((r, i) => {
      const label = `Esigenza ${i + 1}`, text = r.input.value.trim();
      r.input.setAttribute('aria-label', label); r.el.querySelector('label').textContent = label;
      const preview = r.el.querySelector('.rs-need-preview'); preview.querySelector('span').textContent = text; preview.hidden = !text || r.open; preview.setAttribute('aria-label', `Modifica richiesta: ${text}`); preview.setAttribute('aria-expanded', String(r.open));
      r.el.querySelector('.rs-need-edit').hidden = !r.open && !!text;
      r.el.querySelector('.rs-need-toggle').hidden = !text || (!this.canClose && r.status !== 'resolved');
      r.el.querySelector('.rs-need-remove').hidden = !text;
      r.tags.root.hidden = !text;
    });
  }
  arrange() {
    if (!this.rows) return;
    this.root.querySelector('.rs-needs-guide').textContent = this.self ? 'Chi o cosa cerchi? Una richiesta alla volta.' : 'Annota ciò che cerca. Una richiesta alla volta.';
    for (const row of this.rows) {
      const solved = row.status === 'resolved'; (solved ? this.resolved.querySelector('div') : this.active).append(row.el);
      row.el.classList.toggle('is-resolved', solved);
      row.el.querySelector('.rs-need-toggle').textContent = solved ? this.canClose ? 'Cerco ancora' : 'Ripristina appunto' : 'Non cerco più';
    }
    const count = this.rows.filter(r => r.status === 'resolved').length; this.resolved.hidden = !count;
    this.resolved.querySelector('.rs-needs-archive-label').textContent = this.canClose ? 'Non più cercate' : 'Appunti archiviati'; this.resolved.querySelector('.rs-needs-archive-count').textContent = count;
    this.addButton.disabled = this.rows.filter(r => r.input.value.trim()).length >= MAX_NEEDS; this.arrangeLabels(); refreshTextareaSizes(this.root);
  }
  next() {
    let row = this.rows.find(r => r.status === 'active' && !r.input.value.trim());
    if (!row) {
      if (this.rows.filter(r => r.input.value.trim()).length >= MAX_NEEDS) { this.root.querySelector('.rs-needs-error').textContent = `Massimo ${MAX_NEEDS} richieste.`; return; }
      row = this.add();
    }
    this.rows.forEach(r => r.open = r === row); this.arrange(); row.input.focus();
  }
  focus() { const row = this.rows.find(r => r.status === 'active' && !r.input.value.trim()) || this.rows.find(r => r.status === 'active'); if (row) { row.open = true; this.arrange(); row.input.focus(); } }
  appendText(text, tags = {}) {
    if (!text?.trim() || this.rows.some(r => r.input.value.trim() === text.trim())) return;
    let row = this.rows.find(r => r.status === 'active' && !r.input.value.trim());
    if (!row) { if (this.rows.length >= MAX_NEEDS) throw new Error(`Massimo ${MAX_NEEDS} richieste.`); row = this.add(); }
    row.input.value = text; row.tags.set(tags); row.tags.update(text); row.open = true; this.arrange();
  }
  values(now = new Date().toISOString()) {
    const map = Object.fromEntries(Object.keys(this.base).map(id => [id, null]));
    for (const row of this.rows) {
      row.tags.commit(); const text = row.input.value.trim(); if (!text) continue;
      const tags = row.tags.values, value = { text, skills: tags.skills, markets: tags.markets, status: row.status };
      const previous = this.base[row.id]; const same = previous && ['text', 'skills', 'markets', 'status'].every(k => JSON.stringify(value[k]) === JSON.stringify(previous[k]));
      map[row.id] = { ...value, updatedAt: same ? previous.updatedAt : now };
    }
    return validateNeeds(map);
  }
  profile() { return profileNeeds({ needs: Object.entries(this.values()).filter(([, n]) => n?.status === 'active').map(([id, n]) => ({ id, text: n.text })) }); }
  snapshot() { return { needs: this.values(), blocked: Object.fromEntries(this.rows.map(r => [r.id, [...r.tags.blocked]])) }; }
  restore(snapshot) { this.set({ needs: snapshot.needs }); for (const row of this.rows) { row.tags.blocked = new Set(snapshot.blocked[row.id] || []); row.tags.render(); } }
}
