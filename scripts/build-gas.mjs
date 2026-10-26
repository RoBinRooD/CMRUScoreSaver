// รวมไฟล์ฝั่ง server เป็นไฟล์เดียว dist/Code.gs เพื่อคัดลอกไปวางใน Apps Script ได้ในครั้งเดียว
// ใช้: node scripts/build-gas.mjs   (ตรวจว่าเป็นปัจจุบัน: node scripts/build-gas.mjs --check)
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SERVER_FILES = ['js/grade.js', 'server/Code.js', 'server/Db.js', 'server/Auth.js',
  'server/Api.js', 'server/Upload.js', 'server/Groups.js', 'server/Setup.js'];

export function bundle() {
  const header = '// ไฟล์นี้สร้างอัตโนมัติจาก server/*.js และ js/grade.js — อย่าแก้ที่นี่ ให้แก้ไฟล์ต้นทางแล้วรัน node scripts/build-gas.mjs\n';
  return header + SERVER_FILES.map((f) => `\n// ===== ${f} =====\n` + readFileSync(join(root, f), 'utf8')).join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(root, 'dist/Code.gs');
  const code = bundle();
  if (process.argv.includes('--check')) {
    const cur = readFileSync(out, 'utf8');
    if (cur !== code) {
      console.error('dist/Code.gs ไม่เป็นปัจจุบัน — รัน node scripts/build-gas.mjs');
      process.exit(1);
    }
    console.log('dist/Code.gs is up to date');
  } else {
    writeFileSync(out, code);
    copyFileSync(join(root, 'server/appsscript.json'), join(root, 'dist/appsscript.json'));
    console.log('wrote dist/Code.gs');
  }
}
