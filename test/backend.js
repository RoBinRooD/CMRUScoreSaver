// โหลดโค้ดฝั่ง server + memory backend เข้า sandbox เดียวกัน (เหมือนที่ Apps Script รวมทุกไฟล์ไว้ใน global scope)
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const FILES = ['js/grade.js', 'server/Code.js', 'server/Db.js', 'server/Auth.js', 'server/Api.js',
  'server/Upload.js', 'server/Setup.js', 'js/mock/memory-backend.js'];

function loadBackend() {
  const ctx = vm.createContext({ console });
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('memoryReset_()', ctx);
  const call = (email, action, payload) => {
    const res = ctx.handleRequest_({ action, payload, idToken: email ? 'demo:' + email : '' });
    return JSON.parse(JSON.stringify(res));
  };
  const ok = (email, action, payload) => {
    const res = call(email, action, payload);
    if (!res.ok) throw new Error(`${action} failed: ${res.error}`);
    return res.data;
  };
  return { ctx, call, ok, db: () => ctx.MEMORY_DB, setNow: (iso) => { ctx.MEMORY_NOW = iso; } };
}

module.exports = { loadBackend };
