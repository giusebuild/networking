export const tagKey = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Keep the first label stable when saved tags and new suggestions overlap.
export function uniqueTags(values) {
  const seen = new Set();
  return values.map(value => String(value).trim()).filter(value => {
    const key = tagKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// The editor has one row, while the archive still retains each category.
export function tagEntries(groups) {
  const entries = new Map();
  for (const [category, values] of Object.entries(groups)) for (const value of uniqueTags(values)) {
    const key = tagKey(value), entry = entries.get(key);
    if (entry) entry.categories.push(category);
    else entries.set(key, { value, categories: [category] });
  }
  return [...entries.values()];
}
