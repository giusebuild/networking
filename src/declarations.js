// A received card is a snapshot. Reception time cannot establish which owner
// revision is newer; legacy replies without a source date remain independent.
export function hasNewerDeclaration(contributions, cardId, updatedAt) {
  const date = Date.parse(updatedAt);
  return !!cardId && Number.isFinite(date) && contributions.some(c => c?.reply?.cardId === cardId && Number.isFinite(Date.parse(c.reply.cardUpdatedAt)) && Date.parse(c.reply.cardUpdatedAt) > date);
}
export function currentDeclarations(contributions) {
  const declarations = contributions.filter(c => c?.reply);
  const latest = new Map();
  for (const c of declarations) {
    const r = c.reply, date = Date.parse(r.cardUpdatedAt);
    if (!r.cardId || !Number.isFinite(date)) continue;
    latest.set(r.cardId, Math.max(latest.get(r.cardId) ?? -Infinity, date));
  }
  const revisions = new Map();
  return declarations.filter(c => {
    const r = c.reply, date = Date.parse(r.cardUpdatedAt);
    if (!r.cardId || !Number.isFinite(date)) return true;
    if (date < latest.get(r.cardId)) return false;
    // Equal dates with different revisions do not establish an order. Keep both.
    // The same revision received by two facilitators is one declaration.
    if (!revisions.has(r.cardId)) revisions.set(r.cardId, new Set());
    const seen = revisions.get(r.cardId);
    if (seen.has(r.responseId)) return false;
    seen.add(r.responseId); return true;
  });
}
