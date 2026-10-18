import { SmartTags } from './smart-tags.js';
import { icon } from './icons.js';
import { MAX_NEEDS, needsMap, profileNeeds, declaredNeeds, validateNeeds } from './needs.js';

const placeholders = ['Es. Presentazioni a studi medici per proporre il mio servizio', 'Es. Uno studio disponibile due pomeriggi a settimana', 'Es. Un videomaker con cui collaborare'];
export class NeedsEditor {
  constructor(root) {
    this.root = root;
    root.innerHTML = '<div class="rs-needs-active"></div><button type="button" class="rs-text-btn rs-needs-add">'+icon('plus')+'Aggiungi esigenza</button><details class="rs-needs-resolved" hidden><summary>Risolte <span></span></summary><div></div></details><p class="rs-field-hint rs-needs-error" role="status"></p>';
    this.active = root.querySelector('.rs-needs-active'); this.resolved = root.querySelector('details'); this.addButton = root.querySelector('.rs-needs-add');
    this.addButton.addEventListener('click', () => { if (this.rows.length >= MAX_NEEDS) { root.querySelector('.rs-needs-error').textContent = `Massimo ${MAX_NEEDS} esigenze.`; return; } this.add().input.focus(); });
    this.set();
  }
  set(contribution = {}) {
    this.base = needsMap(contribution); this.rows = []; this.active.replaceChildren(); this.resolved.querySelector('div').replaceChildren(); this.resolved.open = false; this.root.querySelector('.rs-needs-error').textContent = '';
    for (const [id, need] of Object.entries(this.base)) if (need) this.add(need, id);
    if (!this.rows.some(r => r.status === 'active')) this.add();
    this.arrange();
  }
  setProfile(profile = {}) { this.set({ needs: declaredNeeds(profile, new Date().toISOString()) }); }
  add(need = {}, id = crypto.randomUUID()) {
    const el = document.createElement('div'); el.className = 'rs-need-item';
    el.innerHTML = '<label class="rs-sr"></label><textarea class="rs-field" maxlength="1500" rows="2"></textarea><div class="rs-need-item-tags"></div><div class="rs-need-item-tools"><button type="button" class="rs-text-btn rs-need-toggle"></button><button type="button" class="rs-text-btn rs-need-remove">'+icon('x')+'Rimuovi</button></div>';
    const input = el.querySelector('textarea'); input.id = `${this.root.id}-${id}`; input.placeholder = placeholders[this.rows.length % placeholders.length]; input.value = need.text || '';
    el.querySelector('label').htmlFor = input.id;
    const tags = new SmartTags(el.querySelector('.rs-need-item-tags'), 'need'); tags.set(need); tags.update(input.value);
    const row = { id, el, input, tags, status: need.status || 'active' }; this.rows.push(row);
    input.addEventListener('input', () => { tags.update(input.value); this.arrangeLabels(); });
    el.querySelector('.rs-need-toggle').addEventListener('click', () => { if (!input.value.trim()) { input.focus(); return; } row.status = row.status === 'active' ? 'resolved' : 'active'; this.arrange(); if (!this.rows.some(r => r.status === 'active')) this.add(); this.focus(); });
    el.querySelector('.rs-need-remove').addEventListener('click', () => { this.rows = this.rows.filter(r => r !== row); el.remove(); if (!this.rows.some(r => r.status === 'active')) this.add(); this.arrange(); this.focus(); });
    this.arrange(); return row;
  }
  arrangeLabels() { this.rows.forEach((r, i) => { const label = `Esigenza ${i + 1}`; r.input.setAttribute('aria-label', label); r.el.querySelector('label').textContent = label; r.el.querySelector('.rs-need-toggle').hidden = !r.input.value.trim(); r.el.querySelector('.rs-need-remove').hidden = this.rows.length === 1 && !r.input.value.trim(); }); }
  arrange() {
    for (const row of this.rows) {
      const solved = row.status === 'resolved'; (solved ? this.resolved.querySelector('div') : this.active).append(row.el);
      row.el.classList.toggle('is-resolved', solved); row.el.querySelector('.rs-need-toggle').innerHTML = solved ? 'Riapri' : icon('check')+'Risolta';
    }
    const count = this.rows.filter(r => r.status === 'resolved').length; this.resolved.hidden = !count; this.resolved.querySelector('summary span').textContent = count;
    this.addButton.disabled = this.rows.length >= MAX_NEEDS; this.arrangeLabels();
  }
  focus() { this.rows.find(r => r.status === 'active')?.input.focus(); }
  appendText(text, tags = {}) {
    if (!text?.trim() || this.rows.some(r => r.input.value.trim() === text.trim())) return;
    let row = this.rows.find(r => r.status === 'active' && !r.input.value.trim());
    if (!row) { if (this.rows.length >= MAX_NEEDS) throw new Error(`Massimo ${MAX_NEEDS} esigenze.`); row = this.add(); }
    row.input.value = text; row.tags.set(tags); row.tags.update(text);
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
