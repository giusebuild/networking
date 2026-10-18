// GitHub Pages/CDN can briefly serve an older HTML page with newer modules.
// Align them before mounting forms or reading/writing any application state.
const BUILD_VERSION = 'dev';
export async function ensureShellVersion({ version = BUILD_VERSION, document = globalThis.document, window = globalThis.window } = {}) {
  if (version === 'dev' || document.querySelector('meta[name="networking-release"]')?.content === version) {
    const current = new URL(window.location.href);
    if (version !== 'dev' && current.searchParams.get('_release') === version) {
      current.searchParams.delete('_release');
      window.history.replaceState(null, '', current.pathname + current.search + current.hash);
    }
    return;
  }
  const fresh = new URL(window.location.href);
  if (fresh.searchParams.get('_release') !== version) {
    fresh.searchParams.set('_release', version);
    window.location.replace(fresh.href);
  } else {
    // Do not loop if the deployment is still propagating. A retry preserves
    // the incoming invitation/response, and no partially mounted form runs.
    const main = document.createElement('main'); main.className = 'rs-shell-update';
    const title = document.createElement('h1'); title.textContent = 'Aggiornamento in corso';
    const copy = document.createElement('p'); copy.textContent = 'La scheda è nel link. Ricarica tra qualche istante per aprirla.';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Ricarica'; retry.addEventListener('click', () => window.location.reload());
    main.append(title, copy, retry); document.body.replaceChildren(main);
  }
  await new Promise(() => {});
}
