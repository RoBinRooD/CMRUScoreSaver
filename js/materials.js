// สื่อการสอนรายสัปดาห์ที่อยู่บน GitHub Pages: materials/<รหัสวิชาตัวเล็ก>/manifest.json
// syllabus แสดงลิงก์ในแถวของสัปดาห์นั้นเอง อาจารย์ไม่ต้องวางลิงก์ และไม่ต้องใช้ช่อง "ไฟล์และลิงก์"
// รูปแบบไฟล์: { "weeks": { "3": [{ "title": "Character Design", "file": "week03-character-design.html" }] } }

const cache = new Map();

// โหมดทดลอง (?demo) ใช้รหัส DEMOxxxx → แสดงสื่อของ ARTDxxxx
const folderOf = (courseCode) => String(courseCode || '').trim().toLowerCase().replace(/^demo(?=\d)/, 'artd');

/** คืน { [สัปดาห์]: [{ title, url }] } — ไม่มีไฟล์หรือโหลดไม่ได้ = {} (ไม่ขัดการแสดง syllabus) */
export function loadMaterials(courseCode) {
  const folder = folderOf(courseCode);
  if (!/^[a-z0-9-]+$/.test(folder)) return Promise.resolve({});
  if (!cache.has(folder)) {
    const base = new URL(`materials/${folder}/`, location.href);
    cache.set(folder, fetch(new URL('manifest.json', base), { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => parseManifest(m, base))
      .catch(() => ({})));
  }
  return cache.get(folder);
}

export function parseManifest(m, base) {
  const out = {};
  const weeks = m && typeof m.weeks === 'object' && m.weeks ? m.weeks : {};
  Object.keys(weeks).forEach((k) => {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > 30 || !Array.isArray(weeks[k])) return;
    const items = weeks[k]
      // ชื่อไฟล์ในโฟลเดอร์เดียวกันเท่านั้น (กันลิงก์ออกนอกเว็บ)
      .filter((x) => x && typeof x.file === 'string' && /^[\w.-]+\.html$/.test(x.file))
      .map((x) => ({ title: String(x.title || x.file).slice(0, 80), url: new URL(x.file, base).href }));
    if (items.length) out[n] = items;
  });
  return out;
}
