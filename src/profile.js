const norm = text => String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const unique = values => [...new Map(values.map(x => x.trim()).filter(Boolean).map(x => [norm(x), x])).values()].slice(0, 40);
export function normalizeLinkedIn(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { throw new Error('Inserisci il link di un profilo LinkedIn, come linkedin.com/in/nome.'); }
  if (!/^(?:www\.|[a-z]{2}\.)?linkedin\.com$/i.test(url.hostname) || url.username || url.password || url.port || !['https:', 'http:'].includes(url.protocol)) throw new Error('Usa un profilo su linkedin.com/in/nome.');
  const match = url.pathname.match(/^\/in\/([^/]+)\/?$/i);
  let slug = '';
  try { slug = decodeURIComponent(match?.[1] || ''); } catch {}
  if (!match || !slug || match[1].length > 140 || /[\s\\/]/.test(slug)) throw new Error('Serve il link di una persona: linkedin.com/in/nome.');
  return `https://www.linkedin.com/in/${match[1]}/`;
}
export const CATALOG = {
  skills: ['Comunicazione', 'Grafica', '3D', 'Design', 'UX/UI', 'Ricerca utenti', 'Sviluppo software', 'Automazioni', 'Analisi dati', 'Project management', 'Product management', 'Vendite', 'Partnership', 'Marketing', 'Python', 'Java', 'JavaScript', 'SQL', 'AI', 'Formazione', 'Strategia', 'Finanza agevolata'],
  markets: ['Digitale', 'Sanità', 'Servizi B2B', 'Nautica', 'Sociale', 'Formazione', 'Turismo', 'Energia', 'Retail', 'Manifattura', 'Finanza', 'Edilizia'],
  interests: ['Vela', 'Sport', 'Fotografia', 'Musica', 'Viaggi', 'Finanza agevolata', 'AI', 'Innovazione', 'Sostenibilità', 'Arte', 'Lettura', 'Volontariato'],
};
const aliases = {
  'Grafica': ['grafico', 'graphic design'], '3D': ['modellazione 3d', 'rendering'],
  'Sviluppo software': ['sviluppatore', 'software developer', 'programmazione'],
  'Analisi dati': ['data analysis', 'data analyst'], 'Ricerca utenti': ['user research'],
  'Automazioni': ['automazione', 'automation'], 'Project management': ['project manager'],
  'Product management': ['product manager', 'product owner'], 'AI': ['intelligenza artificiale', 'artificial intelligence'],
  'Sanità': ['healthcare', 'sanita digitale'], 'Vendite': ['sales', 'sviluppo commerciale'],
  'Marketing': ['marketer'], 'Formazione': ['formatore'],
};
function mentions(text, value) {
  return [value, ...(aliases[value] || [])].some(term => {
    const escaped = norm(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
  });
}
export function suggestedTags(text, extra = {}) {
  const clauses = norm(text).split(/\n|\s+[—–-]\s+|[;.!?]/).map(x => x.trim()).filter(Boolean);
  const personal = clauses.filter(x => /interess|passion|hobby|tempo libero|mi piace|ama\b|vorrei|imparare|sto studiando|mi piacerebbe/.test(x));
  const professional = clauses.filter(x => !personal.includes(x) && !/\bnon\b|\bno\b|senza competenz/.test(x));
  return Object.fromEntries(Object.entries(CATALOG).map(([key, values]) => {
    const pool = unique([...values, ...(extra[key] || [])]);
    const source = key === 'interests' ? personal : professional;
    return [key, pool.filter(value => source.some(line => mentions(line, value)))];
  }));
}
// A local, conservative draft from text supplied by the user. No profile fetching,
// AI service, inferred relationship strength, date, or willingness to collaborate.
export function draftFromText(text, linkedin = '') {
  const raw = String(text || '').trim().slice(0, 15000);
  const draft = { name: '', role: '', help: '', linkedin: normalizeLinkedIn(linkedin), skills: [], markets: [], interests: [] };
  if (!raw) return { ...draft, suggestions: suggestedTags('') };
  const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const headings = { nome: 'name', name: 'name', titolo: 'role', ruolo: 'role', headline: 'role', presentazione: 'help', descrizione: 'help', informazioni: 'help', about: 'help', competenze: 'skills', skills: 'skills', ambiti: 'markets', settori: 'markets', interessi: 'interests', interests: 'interests', linkedin: 'linkedin' };
  let section = '', hadLabels = false;
  for (const line of lines) {
    if (/^(?:https?:\/\/)?(?:(?:www|[a-z]{2})\.)?linkedin\.com\/in\//i.test(line)) {
      if (!draft.linkedin) draft.linkedin = normalizeLinkedIn(line);
      continue;
    }
    const match = line.match(/^([^:]{2,24}):\s*(.*)$/);
    const heading = norm(match ? match[1] : line);
    if (Object.hasOwn(headings, heading)) {
      hadLabels = true; section = headings[heading];
      if (!match || !match[2]) continue;
      const value = match[2];
      if (['skills', 'markets', 'interests'].includes(section)) draft[section].push(...value.split(/[,;•|]/));
      else if (section === 'linkedin') draft.linkedin = normalizeLinkedIn(value);
      else draft[section] += (draft[section] ? '\n' : '') + value;
      continue;
    }
    if (/^(esperienza|experience|formazione|education|attivita|activity|licenze|certificazioni)$/i.test(norm(line))) { section = ''; continue; }
    if (['skills', 'markets', 'interests'].includes(section)) draft[section].push(line.replace(/^[-•]\s*/, ''));
    else if (section === 'help') draft.help += (draft.help ? '\n' : '') + line;
  }
  if (!hadLabels || !draft.name) {
    // Only name-shaped first lines become a proposed name. Never derive it from a URL slug.
    const first = lines[0];
    const nameLike = value => value.length < 80 && /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,4}$/u.test(value) && value.split(/\s+/).every(word => /^\p{Lu}/u.test(word) || /^(di|de|del|della|van|von)$/i.test(word));
    const note = raw.match(/^(.{2,80}?)\s+[—–-]\s+([\s\S]+)$/);
    if (note && nameLike(note[1])) { draft.name = note[1]; if (!hadLabels) draft.help = note[2]; }
    else if (nameLike(first) && first.includes(' ') && !/\b(consulenza|comunicazione|project manager|product manager)\b/i.test(first)) {
      draft.name = first;
      if (!draft.role && lines[1] && lines[1].length <= 160 && !Object.hasOwn(headings, norm(lines[1]))) draft.role = lines[1];
      if (!hadLabels) draft.help = lines.slice(draft.role ? 2 : 1).join('\n');
    } else if (!hadLabels) draft.help = raw;
  }
  const suggestions = suggestedTags(raw);
  for (const key of ['skills', 'markets', 'interests']) draft[key] = unique((draft[key].length ? draft[key] : suggestions[key]).map(x => x.slice(0, 80)));
  draft.name = draft.name.slice(0, 160); draft.role = draft.role.slice(0, 160); draft.help = draft.help.slice(0, 1500);
  return { ...draft, suggestions, shortened: raw.length > 1500 && draft.help.length === 1500 };
}

// Quick notes are supplied by the person mapping the contact. Only explicit
// acquaintance phrases become relationship context; dates are never completed.
export function quickPersonFromText(text) {
  const raw = String(text || '').trim().slice(0, 15000);
  const clauses = raw.split(/\r?\n|[.!?]\s+|\s+[—–-]\s+/).map(x => x.trim()).filter(Boolean);
  const relationships = clauses.filter(x => /^(?:conosciut[oaie]|incontrat[oaie]|ci siamo conosciuti|ci siamo incontrati)\s+(?:a\b|al\b|alla\b|allo\b|all['’]|in\b|durante\b|tramite\b)/i.test(x));
  let professional = raw;
  for (const clause of relationships) professional = professional.replace(clause, '');
  professional = professional.replace(/\s+[—–-]\s*(?=$|\n)/g, '').trim();
  const draft = draftFromText(professional);
  if (!draft.name && /^[\p{Lu}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,4}$/u.test(raw) && raw.length <= 80) {
    draft.name = raw; draft.help = ''; draft.role = '';
  }
  const context = relationships.join(' · ').replace(/^(?:conosciut[oaie]|incontrat[oaie]|ci siamo conosciuti|ci siamo incontrati)\s+/i, '').slice(0, 150);
  const since = context.match(/\b(?:dal|da)\s+(\d{4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?!\d)/i)?.[1] || '';
  return { ...draft, context, since };
}
