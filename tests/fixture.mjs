import { emptyNetwork, ensureMember, keyFor } from '../src/model.js';
export function fixture() {
  const d = emptyNetwork();
  ensureMember(d, { id: '1', login: 'user-one', name: 'Uno' });
  ensureMember(d, { id: '2', login: 'user-two', name: 'Due' });
  d.people.contact = { id: 'contact', name: 'Persona esempio', role: 'Designer', memberId: null, createdBy: '1' };
  for (const authorId of ['1', '2']) {
    const id = keyFor('contact', authorId);
    d.contributions[id] = { id, personId: 'contact', authorId, help: 'Ricerca e servizi', skills: ['UX'], markets: ['Digitale'], interests: ['Musica'], collaboration: 'Aperto' };
    d.relationships[id] = { id, personId: 'contact', authorId, context: 'Ex colleghi', since: '2022', level: 'Buona conoscenza', last: '', note: '' };
  }
  return d;
}
