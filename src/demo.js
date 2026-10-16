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
  return { data, user };
}
