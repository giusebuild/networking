import { emptyNetwork, ensureMember, keyFor } from './model.js';
// Fictional examples only. Never seed these records into the shared repository.
export function demoNetwork() {
  const data = emptyNetwork();
  const user = { id: '10001', login: 'demo-uno', name: 'Tu' };
  ensureMember(data, user);
  ensureMember(data, { id: '10002', login: 'demo-due', name: 'Alex · demo' });
  const entries = [
    ['demo-designer', 'Sofia · demo', 'Design e ricerca', 'Ricerca con le persone e progettazione di servizi semplici da usare.', ['UX/UI', 'Ricerca'], ['Servizi digitali'], ['Fotografia']],
    ['demo-developer', 'Luca · demo', 'Software e automazioni', 'Trasformare attività ripetitive in strumenti utili, con prototipi rapidi.', ['Software', 'Automazioni'], ['Digitale'], ['Musica']],
    ['demo-business', 'Marta · demo', 'Sviluppo commerciale', 'Aprire conversazioni con aziende e costruire partnership.', ['Vendite', 'Partnership'], ['Servizi B2B'], ['Viaggi']],
  ];
  for (const [id, name, role, help, skills, markets, interests] of entries) {
    const authorId = id === 'demo-business' ? '10002' : user.id;
    data.people[id] = { id, name, role, memberId: null, createdBy: authorId };
    const key = keyFor(id, authorId);
    data.contributions[key] = { id: key, personId: id, authorId, help, skills, markets, interests, collaboration: 'Aperto' };
    data.relationships[key] = { id: key, personId: id, authorId, context: 'Esempio dimostrativo', since: '2024', level: 'Buona conoscenza', last: '', note: 'Profilo inventato. Le modifiche alla demo non vengono salvate.' };
  }
  const id = keyFor('demo-developer', '10002');
  data.relationships[id] = { id, personId: 'demo-developer', authorId: '10002', context: 'Presentato da un amico', since: '2025', level: 'Conoscenza occasionale', last: '', note: '' };
  data.contributions[id] = { id, personId: 'demo-developer', authorId: '10002', help: 'Formazione pratica su software e automazioni per piccoli team.', skills: ['Formazione'], markets: ['Digitale'], interests: [], collaboration: 'Da chiedere' };
  data.people['demo-developer'].email = 'luca@example.test';
  const needs = {
    'demo-designer': ['Un videomaker con cui creare contenuti per studi medici.', ['Video'], ['Sanità']],
    'demo-developer': ['Un designer per rendere più semplice un servizio di prenotazioni.', ['Design', 'Prenotazioni'], ['Digitale']],
    'demo-business': ['Un partner tecnico con cui proporre servizi alle imprese locali.', ['Sviluppo software', 'Partnership'], ['Servizi B2B']],
  };
  for (const c of Object.values(data.contributions)) {
    const [text, skills, markets] = needs[c.personId];
    c.need = { text, skills, markets, updatedAt: '2026-10-18T00:00:00.000Z' };
  }
  // Reserved example numbers, never real contacts.
  data.people['github-10002'].phone = '+447700900333';
  data.contributions['github-10002:10002'] = { id: 'github-10002:10002', personId: 'github-10002', authorId: '10002', help: 'Mettere in contatto professionisti e organizzare incontri di community.', skills: ['Partnership'], markets: ['Servizi B2B'], interests: [], collaboration: 'Aperto' };
  data.people['demo-designer'].phone = '+447700900111';
  return { data, user };
}
