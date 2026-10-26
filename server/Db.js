/*
 * Db — ใช้ Google Sheet เป็นฐานข้อมูล: 1 แท็บ = 1 ตาราง, แถวแรก = ชื่อคอลัมน์
 * ทุกค่าเก็บเป็นข้อความ (setup() ตั้ง format เป็น Plain text) แล้วแปลงชนิดในโค้ด
 * (โหมดทดลอง/ทดสอบใช้ js/mock/memory-backend.js ซึ่งเขียนฟังก์ชันชุดเดียวกันทับไว้)
 */

var SCHEMA = {
  Settings: ['key', 'value'],
  Courses: ['courseCode', 'title', 'section', 'term', 'schedule', 'credits', 'teacher',
    'weights', 'maxMidterm', 'maxFinal', 'gradesVisible', 'heldWeeks', 'syllabus', 'syllabusUpdatedAt'],
  Students: ['courseCode', 'studentId', 'name', 'group', 'email', 'boundAt', 'nickname', 'phone'],
  Assignments: ['id', 'courseCode', 'title', 'description', 'maxScore', 'dueAt', 'allowLate', 'published', 'createdAt',
    'groupMax'],
  Submissions: ['id', 'assignmentId', 'studentId', 'files', 'link', 'submittedAt', 'isLate', 'score', 'feedback', 'gradedAt',
    'groupId'],
  Groups: ['id', 'assignmentId', 'name', 'members', 'createdAt'],
  Tasks: ['id', 'groupId', 'title', 'note', 'status', 'assignee', 'dueAt', 'createdBy', 'createdAt', 'updatedAt'],
  Attendance: ['courseCode', 'studentId', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8',
    'w9', 'w10', 'w11', 'w12', 'w13', 'w14', 'w15', 'w16'],
  Exams: ['courseCode', 'studentId', 'midterm', 'final']
};

var _cache = {};

function resetCache_() {
  _cache = {};
}

function ss_() {
  if (!_cache.ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    _cache.ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!_cache.ss) throw new Error('ไม่พบ Google Sheet — รัน setup() ในตัวแก้ไข Apps Script ก่อน');
  }
  return _cache.ss;
}

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function table_(name) {
  var key = 't:' + name;
  if (_cache[key]) return _cache[key];
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบแท็บ "' + name + '" — รัน setup() ก่อน');
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(String);
  var missing = SCHEMA[name].filter(function (h) { return headers.indexOf(h) < 0; });
  if (missing.length) throw new Error('แท็บ "' + name + '" ยังไม่มีคอลัมน์ ' + missing.join(', ') + ' — รัน setup() อีกครั้ง');
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var o = {};
    var blank = true;
    for (var j = 0; j < headers.length; j++) {
      o[headers[j]] = cellText_(values[i][j]);
      if (o[headers[j]] !== '') blank = false;
    }
    if (blank) continue;
    o._row = i + 1;
    rows.push(o);
  }
  _cache[key] = { name: name, sheet: sh, headers: headers, rows: rows };
  return _cache[key];
}

function rows_(name) {
  return table_(name).rows;
}

function toArray_(t, obj) {
  return t.headers.map(function (h) {
    var v = obj[h];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v);
    // กันไม่ให้ข้อความที่ขึ้นต้นด้วย = ถูกตีความเป็นสูตร
    return /^[=+\-@]/.test(v) && isNaN(Number(v)) ? "'" + v : v;
  });
}

// เขียนเป็น Plain text เสมอ — appendRow/แถวที่เกินช่วงที่ setup() จัดรูปแบบไว้ จะแปลง "2/2569" เป็นวันที่ หรือตัดเลข 0 นำหน้า
function writeText_(sh, row, data) {
  var need = row + data.length - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  sh.getRange(row, 1, data.length, data[0].length).setNumberFormat('@').setValues(data);
}

function insert_(name, obj) {
  var t = table_(name);
  obj._row = t.sheet.getLastRow() + 1;
  writeText_(t.sheet, obj._row, [toArray_(t, obj)]);
  t.rows.push(obj);
  return obj;
}

function update_(name, obj) {
  var t = table_(name);
  if (!obj._row) return insert_(name, obj);
  writeText_(t.sheet, obj._row, [toArray_(t, obj)]);
  return obj;
}

/** เขียนทั้งตารางจาก rows_(name) — ใช้ตอนแก้หลายแถวพร้อมกัน (เร็วกว่าเขียนทีละแถว) */
function saveAll_(name) {
  var t = table_(name);
  var sh = t.sheet;
  var data = t.rows.map(function (r) { return toArray_(t, r); });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, t.headers.length).clearContent();
  if (data.length) writeText_(sh, 2, data);
  t.rows.forEach(function (r, i) { r._row = i + 2; });
}

function remove_(name, pred) {
  var t = table_(name);
  var before = t.rows.length;
  t.rows = t.rows.filter(function (r) { return !pred(r); });
  _cache['t:' + name] = t;
  if (t.rows.length !== before) saveAll_(name);
  return before - t.rows.length;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ระบบกำลังยุ่ง กรุณาลองใหม่อีกครั้ง');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function now_() {
  return new Date().toISOString();
}

function uid_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}
