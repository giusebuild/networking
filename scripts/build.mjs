import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await rm(new URL('dist/', root), { recursive: true, force: true });
await mkdir(new URL('dist/', root));
// Allowlist: no private file, export, README, test fixture or credential can enter the site build.
for (const name of ['index.html', 'styles.css', 'src', 'icon.svg', 'manifest.webmanifest', 'sw.js', '.nojekyll']) {
  await cp(new URL(name, root), new URL(`dist/${name}`, root), { recursive: true });
}
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const modules = (await readdir(new URL('dist/src/', root))).filter(name => name.endsWith('.js'));
for (const name of modules) {
  const path = new URL(`dist/src/${name}`, root);
  const text = await readFile(path, 'utf8');
  await writeFile(path, text.replace(/(from\s+|import\s+)(['"])(\.\/[^'"?]+\.js)(?:\?[^'"]*)?\2/g, (_, prefix, quote, file) => `${prefix}${quote}${file}?v=${version}${quote}`));
}
const indexPath = new URL('dist/index.html', root);
let index = await readFile(indexPath, 'utf8');
index = index.replace(/src="\.\/src\/app\.js(?:\?[^"]*)?"/, `src="./src/app.js?v=${version}"`)
  .replace(/href="\.\/styles\.css(?:\?[^"]*)?"/, `href="./styles.css?v=${version}"`)
  .replace('</head>', `<meta name="networking-release" content="${version}"></head>`);
await writeFile(indexPath, index);
const swPath = new URL('dist/sw.js', root);
const shell = ['./', './index.html', `./styles.css?v=${version}`, './icon.svg', './manifest.webmanifest', ...modules.map(name => `./src/${name}?v=${version}`)];
let sw = await readFile(swPath, 'utf8');
sw = sw.replace(/^const CACHE = .*$/m, `const CACHE = 'networking-shell-${version}';`)
  .replace(/^const FILES = .*$/m, `const FILES = ${JSON.stringify(shell)};`);
await writeFile(swPath, sw);
console.log(`Static site ${version} ready in dist/`);
