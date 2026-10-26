/*
 * Memory backend — แทนที่ส่วนที่คุยกับ Google (Sheet, Drive, token) ด้วยข้อมูลในหน่วยความจำ
 * ใช้กับโหมดทดลอง (?demo) ในเบราว์เซอร์ และ Node tests
 * ต้องโหลดหลังไฟล์ใน server/ เพื่อเขียนทับฟังก์ชันชื่อเดียวกัน
 * โทเคนในโหมดนี้คือ "demo:<อีเมล>"
 */

var MEMORY_DB = null;
var MEMORY_KEY = 'cmruscoresaver_demo_db';

function memoryLoad_(seed) {
  if (MEMORY_DB) return MEMORY_DB;
  try {
    var saved = typeof localStorage !== 'undefined' && localStorage.getItem(MEMORY_KEY);
    if (saved) MEMORY_DB = JSON.parse(saved);
  } catch (e) { /* ใช้ seed */ }
  if (!MEMORY_DB) MEMORY_DB = seed || memorySeed_();
  return MEMORY_DB;
}

function memoryReset_(db) {
  MEMORY_DB = db || memorySeed_();
  memoryPersist_();
}

function memoryPersist_() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MEMORY_KEY, JSON.stringify(MEMORY_DB));
  } catch (e) { /* ไม่เป็นไร */ }
}

function memorySeed_() {
  var db = {};
  Object.keys(SCHEMA).forEach(function (k) { db[k] = []; });
  db.Settings = [
    { key: 'teacherEmails', value: 'teacher@demo.ac.th' },
    { key: 'allowedDomains', value: 'demo.ac.th' },
    { key: 'allowedOrigins', value: (typeof location !== 'undefined' ? location.origin + ',' : '') + 'http://localhost:8080' },
    { key: 'clientId', value: 'demo' },
    { key: 'rootFolderId', value: 'root' },
    { key: 'gradeCutoffs', value: JSON.stringify(Grade.DEFAULT_CUTOFFS) },
    { key: 'attendancePoints', value: JSON.stringify(Grade.DEFAULT_ATTENDANCE_POINTS) },
    { key: 'uploadMaxMB', value: '2048' }
  ];
  var first = ['สมชาย', 'สมหญิง', 'ปิยะ', 'อรุณี', 'กิตติ', 'มาลี', 'วีระ', 'ชนิดา'];
  var last = ['ใจดี', 'รักเรียน', 'แสงทอง', 'มีสุข', 'ศรีงาม', 'คำแก้ว', 'บุญมา', 'ทองดี'];
  [['DEMO2303', 'คอมพิวเตอร์กราฟิกเพื่องานออกแบบสองมิติ (ตัวอย่าง)', '69000', 'พฤ. 08:00-12:00'],
    ['DEMO3314', 'คอมพิวเตอร์กราฟิกเพื่องานออกแบบสามมิติ (ตัวอย่าง)', '68000', 'ศ. 08:00-12:00']].forEach(function (c, ci) {
    db.Courses.push({
      courseCode: c[0], title: c[1], section: '01', term: '2/2569', schedule: c[3], credits: '3(2-2-5)',
      teacher: 'อาจารย์ ตัวอย่าง', weights: JSON.stringify(Grade.DEFAULT_WEIGHTS), maxMidterm: '100', maxFinal: '100',
      gradesVisible: 'false', heldWeeks: '[1,2]'
    });
    for (var i = 0; i < 8; i++) {
      var id = c[2] + String(101 + i);
      db.Students.push({
        courseCode: c[0], studentId: id, name: (i % 2 ? 'นาย' : 'นางสาว') + first[(i + ci) % 8] + ' ' + last[i],
        group: 'ตัวอย่าง.' + (ci + 1), email: '', boundAt: '', nickname: '', phone: ''
      });
      db.Attendance.push({ courseCode: c[0], studentId: id, w1: 'P', w2: i === 3 ? 'A' : i === 5 ? 'L' : 'P' });
    }
  });
  var day = 24 * 3600 * 1000;
  db.Assignments.push(
    { id: 'A1', courseCode: 'DEMO2303', title: 'งานที่ 1: โลโก้', description: 'ออกแบบโลโก้ร้านกาแฟ ส่งไฟล์ .ai และ .png',
      maxScore: '10', dueAt: new Date(Date.now() - 3 * day).toISOString(), allowLate: 'true', published: 'true', createdAt: '' },
    { id: 'A2', courseCode: 'DEMO2303', title: 'งานที่ 2: โปสเตอร์', description: 'โปสเตอร์ A3 ขนาด 300dpi',
      maxScore: '20', dueAt: new Date(Date.now() + 7 * day).toISOString(), allowLate: 'false', published: 'true', createdAt: '' },
    { id: 'A3', courseCode: 'DEMO3314', title: 'งานที่ 1: โมเดลแก้วน้ำ', description: 'ส่งไฟล์ .blend และภาพเรนเดอร์',
      maxScore: '10', dueAt: new Date(Date.now() + 5 * day).toISOString(), allowLate: 'true', published: 'true', createdAt: '' },
    { id: 'A4', courseCode: 'DEMO2303', title: 'งานกลุ่ม: แบรนด์ร้านค้า', description: 'กลุ่มละไม่เกิน 3 คน ส่งไฟล์ brand book (.pdf)',
      maxScore: '30', dueAt: new Date(Date.now() + 10 * day).toISOString(), allowLate: 'true', published: 'true', createdAt: '', groupMax: '3' }
  );
  db.Groups.push({ id: 'G1', assignmentId: 'A4', name: 'กาแฟดี', members: JSON.stringify(['69000101', '69000102']), createdAt: '' });
  db.Submissions.push(
    { id: 'S1', assignmentId: 'A1', studentId: '69000101', files: JSON.stringify([{ id: 'demo-file-1', name: 'logo.png', size: 524288, mimeType: 'image/png' }]),
      link: '', submittedAt: new Date(Date.now() - 4 * day).toISOString(), isLate: 'false', score: '8', feedback: 'สีสวย ตัวอักษรอ่านง่าย', gradedAt: new Date().toISOString() },
    { id: 'S2', assignmentId: 'A1', studentId: '69000102', files: JSON.stringify([{ id: 'demo-file-2', name: 'logo-final.ai', size: 3145728, mimeType: 'application/postscript' }]),
      link: '', submittedAt: new Date(Date.now() - 2 * day).toISOString(), isLate: 'true', score: '', feedback: '', gradedAt: '' }
  );
  // ตัวอย่างนักศึกษาที่สมัครแล้ว
  [['69000101', 'ส้ม'], ['68000102', 'บีม']].forEach(function (x) {
    db.Students.filter(function (r) { return r.studentId === x[0]; }).forEach(function (r) {
      r.email = x[0] + '@demo.ac.th';
      r.boundAt = new Date().toISOString();
      r.nickname = x[1];
    });
  });
  db._files = {};
  db._rate = {};
  db._seq = 100;
  return db;
}

/* ---------- เขียนทับ Db ---------- */

function resetCache_() {
  _cache = {};
  memoryLoad_();
}

function table_(name) {
  var db = memoryLoad_();
  if (!db[name]) throw new Error('ไม่พบตาราง ' + name);
  return { name: name, headers: SCHEMA[name], rows: db[name] };
}

function rows_(name) {
  return memoryLoad_()[name];
}

function normalize_(name, obj) {
  SCHEMA[name].forEach(function (h) {
    var v = obj[h];
    obj[h] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
  obj._row = 1;
}

function insert_(name, obj) {
  normalize_(name, obj);
  memoryLoad_()[name].push(obj);
  memoryPersist_();
  return obj;
}

function update_(name, obj) {
  var list = memoryLoad_()[name];
  normalize_(name, obj);
  if (list.indexOf(obj) < 0) list.push(obj);
  memoryPersist_();
  return obj;
}

function saveAll_(name) {
  memoryLoad_()[name].forEach(function (r) { normalize_(name, r); });
  memoryPersist_();
}

function remove_(name, pred) {
  var db = memoryLoad_();
  var before = db[name].length;
  db[name] = db[name].filter(function (r) { return !pred(r); });
  memoryPersist_();
  return before - db[name].length;
}

function withLock_(fn) {
  return fn();
}

function now_() {
  return typeof MEMORY_NOW === 'string' ? MEMORY_NOW : new Date().toISOString();
}

function uid_(prefix) {
  var db = memoryLoad_();
  db._seq = (db._seq || 0) + 1;
  return prefix + 'demo' + db._seq;
}

/* ---------- เขียนทับ Auth ---------- */

function verifyIdToken_(token) {
  var m = /^demo:(.+@.+)$/.exec(String(token || ''));
  if (!m) throw new Error('AUTH: กรุณาเข้าสู่ระบบ');
  return { email: m[1].toLowerCase(), name: m[1].split('@')[0] };
}

function rateLimit_(key, max, seconds, message) {
  var db = memoryLoad_();
  db._rate = db._rate || {};
  if ((db._rate[key] || 0) >= max) throw new Error(message);
  return function hit() {
    db._rate[key] = (db._rate[key] || 0) + 1;
    memoryPersist_();
  };
}

/* ---------- เขียนทับ Drive ---------- */

function submissionFolderId_(a, folderName) {
  return a.courseCode + '/' + a.id + '/' + folderName;
}

function startResumable_(o) {
  var id = uid_('file');
  memoryLoad_()._files[id] = {
    id: id, name: o.name, size: String(o.size), mimeType: o.mimeType, trashed: false,
    appProperties: o.appProperties, shared: []
  };
  memoryPersist_();
  return 'demo-upload://' + id;
}

function getDriveFile_(id) {
  return memoryLoad_()._files[id] || null;
}

function shareReader_(id, email) {
  var f = memoryLoad_()._files[id];
  if (f && f.shared.indexOf(email) < 0) f.shared.push(email);
  memoryPersist_();
}

function trashFile_(id) {
  var f = memoryLoad_()._files[id];
  if (f) f.trashed = true;
  memoryPersist_();
}
