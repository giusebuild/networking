import { cp, mkdir, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await rm(new URL('dist/', root), { recursive: true, force: true });
await mkdir(new URL('dist/', root));
// Allowlist: no private file, export, README, test fixture or credential can enter the site build.
for (const name of ['index.html', 'styles.css', 'src', 'icon.svg', 'manifest.webmanifest', 'sw.js', '.nojekyll']) {
  await cp(new URL(name, root), new URL(`dist/${name}`, root), { recursive: true });
}
console.log('Static site ready in dist/');
