// ติดเลขเวอร์ชัน (hash ของเนื้อหา) ให้ทุกไฟล์ของหน้าเว็บใน index.html เพื่อไม่ให้เบราว์เซอร์ใช้ไฟล์เก่าที่ค้างไว้
// GitHub Pages ให้แคชได้ 10 นาที และ ES module ที่ import กันเองมักไม่ถูกโหลดใหม่แม้กดรีเฟรช
// → ใช้ import map แปลง ./js/x.js เป็น ./js/x.js?v=<hash> (แก้ไฟล์ไหน hash ไฟล์นั้นเปลี่ยน)
// ใช้: node scripts/build-web.mjs   (ตรวจว่าเป็นปัจจุบัน: node scripts/build-web.mjs --check)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIC = ['js/config.js', 'js/grade.js', 'js/roster.js'];

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = dir + '/' + name;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const hashOf = (rel) => createHash('sha256').update(readFileSync(join(root, rel))).digest('hex').slice(0, 10);

export function render(html) {
  const modules = walk('js').filter((f) => f.endsWith('.js') && !CLASSIC.includes(f) && !f.startsWith('js/mock/')).sort();
  const demo = [...walk('server').filter((f) => f.endsWith('.js')), 'js/mock/memory-backend.js'].sort();
  const all = ['css/style.css', ...CLASSIC, ...modules, ...demo];
  const h = Object.fromEntries(all.map((f) => [f, hashOf(f)]));
  const build = createHash('sha256').update(all.map((f) => f + h[f]).join()).digest('hex').slice(0, 8);
  const v = (f) => `${f}?v=${h[f]}`;
  const head = [
    '<!-- assets:start (สร้างโดย npm run build — อย่าแก้เอง) -->',
    `  <link rel="stylesheet" href="${v('css/style.css')}">`,
    `  <script>window.ASSET_VERSION = ${JSON.stringify({ build, ...Object.fromEntries(demo.map((f) => [f, h[f]])) })};</script>`,
    ...CLASSIC.map((f) => `  <script src="${v(f)}"></script>`),
    `  <script type="importmap">${JSON.stringify({ imports: Object.fromEntries(modules.map((f) => ['./' + f, './' + v(f)])) })}</script>`,
    '  <!-- assets:end -->'
  ].join('\n');
  const body = [
    '<!-- app:start -->',
    `  <footer class="build muted small">เวอร์ชัน ${build}</footer>`,
    `  <script type="module" src="${v('js/app.js')}"></script>`,
    '  <!-- app:end -->'
  ].join('\n');
  return html
    .replace(/<!-- assets:start[\s\S]*?<!-- assets:end -->/, head)
    .replace(/<!-- app:start -->[\s\S]*?<!-- app:end -->/, body);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = join(root, 'index.html');
  const cur = readFileSync(file, 'utf8');
  const next = render(cur);
  if (process.argv.includes('--check')) {
    if (cur !== next) {
      console.error('index.html ไม่เป็นปัจจุบัน — รัน npm run build');
      process.exit(1);
    }
    console.log('index.html is up to date');
  } else {
    writeFileSync(file, next);
    console.log('wrote index.html');
  }
}
