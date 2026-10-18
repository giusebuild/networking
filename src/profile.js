const norm = text => String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const unique = (values, limit = 40) => [...new Map(values.map(x => x.trim()).filter(Boolean).map(x => [norm(x), x])).values()].slice(0, limit);
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
  skills: ['Comunicazione', 'Grafica', '3D', 'Design', 'UX/UI', 'Ricerca utenti', 'Siti web', 'Prenotazioni', 'Video', 'Fotografia', 'Sviluppo software', 'Automazioni', 'Analisi dati', 'Project management', 'Product management', 'Vendite', 'Partnership', 'Marketing', 'Python', 'Java', 'JavaScript', 'SQL', 'AI', 'Formazione', 'Strategia', 'Finanza agevolata'],
  markets: ['Digitale', 'Sanità', 'Servizi B2B', 'Nautica', 'Sociale', 'Formazione', 'Turismo', 'Energia', 'Retail', 'Manifattura', 'Finanza', 'Edilizia'],
  interests: ['Vela', 'Sport', 'Fotografia', 'Musica', 'Viaggi', 'Finanza agevolata', 'AI', 'Innovazione', 'Sostenibilità', 'Arte', 'Lettura', 'Volontariato'],
};
const aliases = {
  'Design': ['designer'], 'Grafica': ['grafico', 'graphic design'], '3D': ['modellazione 3d', 'rendering'],
  'Sviluppo software': ['sviluppatore', 'software developer', 'programmazione'],
  'Analisi dati': ['data analysis', 'data analyst'], 'Ricerca utenti': ['user research'],
  'Automazioni': ['automazione', 'automation'], 'Project management': ['project manager'],
  'Product management': ['product manager', 'product owner'], 'AI': ['intelligenza artificiale', 'artificial intelligence'],
  'Sanità': ['healthcare', 'sanita digitale'], 'Vendite': ['sales', 'sviluppo commerciale'],
  'Marketing': ['marketer'], 'Formazione': ['formatore'],
  'Siti web': ['sito web', 'siti', 'website', 'web design'], 'Prenotazioni': ['prenotazione', 'booking'],
  'Video': ['videomaker', 'videomaking', 'video maker'], 'Fotografia': ['fotografo', 'fotografa'],
  'Collaborazioni': ['collaborazione'],
};
aliases['Sanità'].push('studi medici', 'studio medico', 'cliniche', 'clinica');
const requestStart = /^(?:(?:attualmente|ora|oggi|al momento)\s+)?(?:(?:sto|sta|stiamo)\s+cercando|cerc(?:o|a|hiamo|ano)|(?:ho|ha|abbiamo)\s+bisogno|(?:mi|gli|ci)\s+serv(?:e|ono)|(?:sono|e|siamo)\s+alla\s+ricerca|vorrei\s+(?:imparare|trovare|conoscere)|(?:i am |i’m |i'm |we are )?(?:looking for|seeking)|bisogno|richiesta)\b/i;
export function separateIntents(text) {
  const clauses = String(text || '').replace(/\s+(?:e|ma)\s+(?=(?:cerco|cerca|ho bisogno|ha bisogno|mi serve|gli serve|sono alla ricerca|vorrei|I am looking)\b)/gi, '\n').split(/\r?\n|[;.!?]\s+|\s+[—–-]\s+/).map(x => x.trim()).filter(Boolean);
  return { help: clauses.filter(x => !requestStart.test(norm(x))).join('\n'), need: clauses.filter(x => requestStart.test(norm(x))).join('\n') };
}
function mentions(text, value) {
  return [value, ...(aliases[value] || [])].some(term => {
    const escaped = norm(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
  });
}
export function suggestedTags(text, extra = {}) {
  const clauses = norm(text).replace(/(?:https?:\/\/|(?:www\.)?linkedin\.com\/)\S+/g, '').split(/\n|\s+[—–-]\s+|[;.!?]/).map(x => x.trim()).filter(Boolean);
  const personal = clauses.filter(x => /interess|passion|hobby|tempo libero|mi piace|ama\b|vorrei|imparare|sto studiando|mi piacerebbe/.test(x));
  const professional = clauses.filter(x => !personal.includes(x) && !/\bnon\b|\bno\b|senza competenz/.test(x));
  return Object.fromEntries(Object.entries(CATALOG).map(([key, values]) => {
    const pool = unique([...values, ...(extra[key] || [])], Infinity);
    const source = key === 'interests' ? personal : professional.filter(x => !requestStart.test(x));
    return [key, pool.filter(value => source.some(line => mentions(line, value))).slice(0, 40)];
  }));
}
export function needTags(text, extra = {}) {
  const stripped = norm(text).split('\n').map(line => line.trim().replace(requestStart, '')).join('\n').replace(/\b(?:vorrei|imparare|sto studiando|mi piacerebbe|interesse|appassionat[oa])\b/gi, '');
  // Requests can name a collaboration rather than a specific profession.
  const tags = suggestedTags(stripped, { ...extra, skills: [...(extra.skills || []), 'Collaborazioni'] });
  return { skills: tags.skills, markets: tags.markets, interests: [] };
}
// A local, conservative draft from text supplied by the user. No profile fetching,
// AI service, inferred relationship strength, date, or willingness to collaborate.
const offerAction = /^(?:(?:oggi|attualmente|in particolare)\s+)?(?:aiut[oa]|aiutiamo|support[oa]|affianc[oa]|realizz[oa]|realizziamo|svilupp[oa]|progett[oa]|gestisc[oe]|mi occupo di|si occupa di|offr[oe]|posso aiutare|pu[oò] aiutare|i help|we help|i build|i design)\b/i;
const professionalClaim = /\b(?:esperienza|specializzat[oaie]|competenze|consulente|designer|developer|sviluppatore|mi occupo|si occupa|lavoro|lavora|realizzo|realizza|progetto|progetta|sviluppo|sviluppa|aiuto|aiuta)\b/i;
function concreteOffer(text, explicit, skills, markets) {
  if (explicit.trim()) return separateIntents(explicit).help.trim().slice(0, 500);
  const professional = separateIntents(text).help.split(/\r?\n|[;.!?]\s+|\s+[—–-]\s+/).map(x => x.trim()).filter(Boolean);
  const actions = professional.filter(x => offerAction.test(x) && !/\b(?:non|no longer|vorrei|imparare)\b/i.test(x));
  if (actions.length) return actions.slice(0, 2).join(' ').slice(0, 500);
  // A short list of abilities is useful; career history and generic biographies
  // stay in the original, rather than becoming an invented service description.
  if (skills.length && (professionalClaim.test(text) || professional.some(x => x.length < 110 && !/\b(?:anni|nato|laureat|passion|interess|ama\b|hobby)\b/i.test(x)))) {
    return [...skills.slice(0, 3), ...markets.slice(0, 2)].join(' · ');
  }
  return '';
}
export function draftFromText(text, linkedin = '') {
  const raw = String(text || '').trim().slice(0, 15000);
  const draft = { name: '', role: '', help: '', need: '', presentation: '', linkedin: normalizeLinkedIn(linkedin), skills: [], markets: [], interests: [] };
  if (!raw) return { ...draft, suggestions: suggestedTags(''), needTags: needTags('') };
  const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const headings = { nome: 'name', name: 'name', titolo: 'role', ruolo: 'role', headline: 'role', presentazione: 'presentation', descrizione: 'presentation', informazioni: 'presentation', about: 'presentation', competenze: 'skills', skills: 'skills', ambiti: 'markets', settori: 'markets', interessi: 'interests', interests: 'interests', linkedin: 'linkedin', 'posso aiutare con': 'help', 'puo aiutare con': 'help', offro: 'help', offre: 'help', cerco: 'need', cerca: 'need', bisogno: 'need' };
  let section = '', hadLabels = false;
  for (const line of lines) {
    if (/^(?:https?:\/\/)?(?:(?:www|[a-z]{2})\.)?linkedin\.com\/in\//i.test(line)) { if (!draft.linkedin) draft.linkedin = normalizeLinkedIn(line); continue; }
    const match = line.match(/^([^:]{2,24}):\s*(.*)$/), heading = norm(match ? match[1] : line);
    if (Object.hasOwn(headings, heading)) {
      hadLabels = true; section = headings[heading]; if (!match || !match[2]) continue;
      const value = match[2];
      if (['skills', 'markets', 'interests'].includes(section)) draft[section].push(...value.split(/[,;•|]/));
      else if (section === 'linkedin') draft.linkedin = normalizeLinkedIn(value);
      else draft[section] += (draft[section] ? '\n' : '') + value;
      continue;
    }
    if (/^(esperienza|experience|formazione|education|attivita|activity|licenze|certificazioni)$/i.test(norm(line))) { section = ''; continue; }
    if (['skills', 'markets', 'interests'].includes(section)) draft[section].push(line.replace(/^[-•]\s*/, ''));
    else if (['help', 'need', 'presentation'].includes(section)) draft[section] += (draft[section] ? '\n' : '') + line;
  }
  if (!hadLabels || !draft.name) {
    const first = lines[0];
    const nameLike = value => value.length < 80 && /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,4}$/u.test(value) && value.split(/\s+/).every(word => /^\p{Lu}/u.test(word) || /^(di|de|del|della|van|von)$/i.test(word));
    const note = raw.match(/^(.{2,80}?)\s+[—–-]\s+([\s\S]+)$/);
    if (note && nameLike(note[1])) { draft.name = note[1]; if (!hadLabels) draft.presentation = note[2]; }
    else if (nameLike(first) && first.includes(' ') && !/\b(consulenza|comunicazione|project manager|product manager)\b/i.test(first)) {
      draft.name = first;
      if (!draft.role && lines[1] && lines[1].length <= 160 && !Object.hasOwn(headings, norm(lines[1])) && !requestStart.test(norm(lines[1])) && !offerAction.test(lines[1])) draft.role = lines[1];
      if (!hadLabels) draft.presentation = lines.slice(draft.role ? 2 : 1).join('\n');
    } else if (!hadLabels) draft.presentation = raw;
  }
  const onlyLink = /^(?:https?:\/\/)?(?:(?:www|[a-z]{2})\.)?linkedin\.com\/in\/\S+$/i;
  if (onlyLink.test(draft.presentation)) draft.presentation = '';
  const original = raw;
  const separated = separateIntents([draft.help, draft.presentation].filter(Boolean).join('\n'));
  draft.need = unique([draft.need, separated.need].filter(Boolean), Infinity).join('\n').slice(0, 1500);
  const suggestions = suggestedTags([separated.help, draft.role].filter(Boolean).join('\n'));
  for (const key of ['skills', 'markets', 'interests']) draft[key] = unique((draft[key].length ? draft[key] : suggestions[key]).map(x => x.slice(0, 80)));
  draft.help = concreteOffer(draft.presentation, draft.help, draft.skills, draft.markets);
  // Keep the copied source out of cards and search. It is available on demand.
  draft.presentation = !onlyLink.test(original) && (draft.presentation || hadLabels || draft.help || draft.need) ? original.slice(0, 5000) : '';
  draft.name = draft.name.slice(0, 160); draft.role = draft.role.slice(0, 160);
  return { ...draft, needTags: needTags(draft.need), suggestions, shortened: original.length > 5000 };
}

// Quick notes are supplied by the person mapping the contact. Only explicit
// acquaintance phrases become relationship context; dates are never completed.
export function quickPersonFromText(text) {
  const raw = String(text || '').trim().slice(0, 15000);
  const clauses = raw.split(/\r?\n|[.!?]\s+|\s+[—–-]\s+/).map(x => x.trim()).filter(Boolean);
  const relationships = clauses.filter(x => /^(?:conosciut[oaie]|incontrat[oaie]|ci siamo conosciuti|ci siamo incontrati)\s+(?:a\b|al\b|alla\b|allo\b|all['’]|in\b|durante\b|tramite\b)/i.test(x));
  let professional = raw;
  for (const clause of relationships) {
    const start = professional.indexOf(clause);
    if (start < 0) continue;
    const end = start + clause.length;
    const punctuation = /[.!?]/.test(professional[end] || '') ? 1 : 0;
    professional = professional.slice(0, start) + professional.slice(end + punctuation);
  }
  professional = professional.replace(/\s+[—–-]\s*(?=$|\n)/g, '').trim();
  const draft = draftFromText(professional);
  if (!draft.name && /^[\p{Lu}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,4}$/u.test(raw) && raw.length <= 80) {
    draft.name = raw; draft.help = ''; draft.role = ''; draft.presentation = '';
  }
  const context = relationships.join(' · ').replace(/^(?:conosciut[oaie]|incontrat[oaie]|ci siamo conosciuti|ci siamo incontrati)\s+/i, '').slice(0, 150);
  const since = context.match(/\b(?:dal|da)\s+(\d{4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?!\d)/i)?.[1] || '';
  return { ...draft, context, since };
}
