export function newerVersion(candidate, current) {
  if (![candidate, current].every(v => /^\d+\.\d+\.\d+$/.test(v || ''))) return false;
  const a = candidate.split('.').map(Number), b = current.split('.').map(Number);
  return a.some((n, i) => n > b[i] && a.slice(0, i).every((x, j) => x === b[j]));
}

export function watchUpdates({ version, onUpdate, document, window, navigator, fetch }) {
  let registration, checking;
  async function check() {
    if (checking) return checking;
    checking = (async () => {
      try {
        const response = await fetch(new URL('./version.json', document.baseURI).href, { cache: 'no-store', credentials: 'omit' });
        if (!response.ok) return null;
        const next = await response.json(), available = newerVersion(next.version, version);
        if (available) onUpdate(next.version);
        return available;
      } catch { return null; }
      finally { checking = null; }
    })();
    return checking;
  }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(reg => {
      registration = reg;
      reg.addEventListener('updatefound', () => { const worker = reg.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed') check(); }); });
    }).catch(() => {});
  }
  const wake = () => { if (document.visibilityState === 'visible') { check(); registration?.update().catch(() => {}); } };
  document.addEventListener('visibilitychange', wake); window.addEventListener('online', check);
  const interval = setInterval(wake, 300000);
  if (/^\d+\.\d+\.\d+$/.test(version)) check();
  return {
    check,
    async apply() {
      if (registration?.waiting) {
        await new Promise(resolve => {
          const done = () => { navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); };
          navigator.serviceWorker.addEventListener('controllerchange', done);
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          setTimeout(done, 2000);
        });
      }
      window.location.reload();
    },
    stop() { clearInterval(interval); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', check); },
  };
}
