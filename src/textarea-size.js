// Keep complete offers and requests visible, including values loaded into a form.
// Resize only visible fields; closed dialogs and disclosures have no usable width.
export function refreshTextareaSizes(root) {
  for (const field of root.querySelectorAll('textarea:not([readonly])')) {
    if (!field.scrollHeight || !field.getClientRects?.().length) continue;
    field.setAttribute('data-auto-size', '');
    const style = getComputedStyle(field);
    const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    field.style.height = 'auto';
    field.style.height = Math.ceil(field.scrollHeight + border) + 'px';
  }
}

export function mountTextareaSizes(root) {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const run = () => { scheduled = false; refreshTextareaSizes(root); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
  };
  root.addEventListener('input', schedule);
  root.addEventListener('focusin', schedule);
  root.addEventListener('toggle', schedule, true);
  // Values are prepared before forms open. The visibility change is the point
  // at which their actual text wrapping can be measured.
  if (typeof MutationObserver === 'function') new MutationObserver(schedule).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(root);
  globalThis.addEventListener?.('resize', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
}
