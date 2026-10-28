// ไฟล์นี้สร้างอัตโนมัติจาก server/*.js และ js/grade.js — อย่าแก้ที่นี่ ให้แก้ไฟล์ต้นทางแล้วรัน node scripts/build-gas.mjs

// ===== js/grade.js =====
/*
 * Grade — คำนวณคะแนนรวมและเกรด
 * ไฟล์นี้ใช้ร่วมกัน 3 ที่: เบราว์เซอร์ (window.Grade), Node tests, และ Apps Script (ถูกรวมเข้า dist/Code.gs)
 * จึงเขียนเป็น JavaScript ธรรมดา ไม่ใช้ import/export
 */
var Grade = (function () {
  // คะแนนเก็บ 80 = เข้าเรียน 10 + งาน 70 → ระบบทะเบียน: เก็บครึ่งแรก 40 · เก็บครึ่งหลัง 40 · กลางภาค 10 · ปลายภาค 10
  var DEFAULT_WEIGHTS = { attendance: 10, assignments: 70, midterm: 10, final: 10 };
  var DEFAULT_CUTOFFS = [['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['D+', 55], ['D', 50], ['F', 0]];
  // P = มา, L = สาย, E = ลา, A = ขาด
  var DEFAULT_ATTENDANCE_POINTS = { P: 1, L: 0.5, E: 1, A: 0 };
  // ขาดที่นับ = ขาด + (สาย ÷ latePerAbsence ปัดลง) · ลาไม่นับ · ตั้งแต่ warnAt = อาจารย์ติดตาม · เกิน failAbove = F
  var DEFAULT_ATTENDANCE_RULES = { failAbove: 4, warnAt: 3, latePerAbsence: 2 };
  var WEEKS = 16;
  var PARTS = ['attendance', 'assignments', 'midterm', 'final'];

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /** สัปดาห์ที่นับของนักศึกษาคนนี้: อยู่ใน heldWeeks และมีเครื่องหมาย — ช่องว่าง = ยังไม่เช็ค ไม่นับ */
  function markedWeeks(marks, heldWeeks) {
    return (heldWeeks || []).filter(function (w) { return w >= 1 && w <= WEEKS && (marks || [])[w - 1]; });
  }

  /** marks: array ยาว 16 (index 0 = สัปดาห์ 1), heldWeeks: สัปดาห์ที่มีการเช็คชื่อแล้ว (เลข 1–16) */
  function attendance(marks, heldWeeks, points) {
    points = points || DEFAULT_ATTENDANCE_POINTS;
    var weeks = markedWeeks(marks, heldWeeks);
    if (!weeks.length) return { held: 0, earned: 0, pct: null };
    var earned = 0;
    weeks.forEach(function (w) { earned += num(points[marks[w - 1]]) || 0; });
    return { held: weeks.length, earned: earned, pct: round2((earned / weeks.length) * 100) };
  }

  /** นับการขาดเรียนตามเกณฑ์ — นับเฉพาะช่องที่เช็คแล้ว (ขาดต้องกด A) */
  function absences(marks, heldWeeks, rules) {
    var r = rules || DEFAULT_ATTENDANCE_RULES;
    var c = { A: 0, L: 0, E: 0 };
    markedWeeks(marks, heldWeeks).forEach(function (w) {
      var m = marks[w - 1];
      if (c[m] !== undefined) c[m]++;
    });
    var per = num(r.latePerAbsence) || 0;
    var effective = c.A + (per > 0 ? Math.floor(c.L / per) : 0);
    return {
      absent: c.A, late: c.L, leave: c.E, effective: effective,
      warnAt: num(r.warnAt), failAbove: num(r.failAbove), latePerAbsence: per,
      warn: num(r.warnAt) !== null && effective >= num(r.warnAt),
      fail: num(r.failAbove) !== null && effective > num(r.failAbove)
    };
  }

  /**
   * items: [{score, maxScore, overdue, submitted}] — นับงานที่ให้คะแนนแล้ว หรือเลยกำหนดแล้วไม่ได้ส่ง (= 0)
   * ส่งแล้วแต่ยังไม่ตรวจ = ยังไม่นับ
   */
  function assignments(items) {
    var got = 0, max = 0, counted = 0;
    (items || []).forEach(function (it) {
      var s = num(it.score), m = num(it.maxScore);
      if (!m || m <= 0) return;
      if (s === null && (!it.overdue || it.submitted)) return;
      got += s || 0;
      max += m;
      counted++;
    });
    return { counted: counted, earned: got, max: max, pct: max ? round2((got / max) * 100) : null };
  }

  function exam(score, max) {
    var s = num(score), m = num(max);
    if (s === null || !m) return { score: s, max: m, pct: null };
    return { score: s, max: m, pct: round2((s / m) * 100) };
  }

  function letter(total, cutoffs) {
    var list = (cutoffs && cutoffs.length ? cutoffs : DEFAULT_CUTOFFS).slice().sort(function (a, b) { return b[1] - a[1]; });
    for (var i = 0; i < list.length; i++) {
      if (total >= Number(list[i][1])) return list[i][0];
    }
    return list[list.length - 1][0];
  }

  /**
   * งานแบ่งเป็นครึ่งเทอมแรก/หลัง (half: 1 | 2, ไม่ระบุ = 1) แต่ละครึ่งได้น้ำหนักงานครึ่งหนึ่ง
   * คืน pct = ค่าเฉลี่ยของครึ่งที่มีงานนับแล้ว (สำหรับแสดง) และ points = คะแนนที่ใช้รวมจริง (ครึ่งที่ยังไม่มีงาน = 0)
   */
  function assignmentHalves(items, weight) {
    var byHalf = { 1: [], 2: [] };
    (items || []).forEach(function (it) { byHalf[Number(it.half) === 2 ? 2 : 1].push(it); });
    var first = assignments(byHalf[1]), second = assignments(byHalf[2]);
    var all = assignments(items);
    var pcts = [first.pct, second.pct].filter(function (p) { return p !== null; });
    all.first = first;
    all.second = second;
    all.pct = pcts.length ? round2(pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length) : null;
    all.halfPoints = [first, second].map(function (h) { return h.pct === null ? 0 : (h.pct / 100) * (weight / 2); });
    all.points = pcts.length ? round2(all.halfPoints[0] + all.halfPoints[1]) : null;
    return all;
  }

  /**
   * input: { weights, cutoffs, attendancePoints, attendanceRules, heldWeeks, attendance (marks),
   *          assignments: [{score,maxScore,overdue,half}], midterm, maxMidterm, final, maxFinal }
   * คืน: { parts: {attendance, assignments, midterm, final}, halves, absence, total, grade }
   * ขาดเรียนเกินเกณฑ์ = เกรด F (คะแนนรวมยังแสดงตามจริง)
   * grade = null จนกว่าทุกส่วนที่มีน้ำหนักจะมีคะแนน (ต้นเทอมไม่ขึ้น F เพราะส่วนที่ยังไม่มีคะแนนนับเป็น 0)
   * projectedGrade = แนวโน้มจากเฉพาะส่วนที่มีคะแนนแล้ว (เทียบเป็น 100)
   * halves = 4 ช่องของระบบทะเบียน: เก็บครึ่งแรก/หลัง (= เข้าเรียน ÷ 2 + งานของครึ่งนั้น), กลางภาค, ปลายภาค
   * ส่วนที่ยังไม่มีคะแนน (pct = null) นับเป็น 0 ในคะแนนรวม · total = ผลรวม 4 ช่อง
   */
  function compute(input) {
    var w = input.weights || DEFAULT_WEIGHTS;
    var wa = num(w.assignments) || 0;
    var parts = {
      attendance: attendance(input.attendance, input.heldWeeks, input.attendancePoints),
      assignments: assignmentHalves(input.assignments, wa),
      midterm: exam(input.midterm, input.maxMidterm),
      final: exam(input.final, input.maxFinal)
    };
    PARTS.forEach(function (k) {
      var weight = num(w[k]) || 0;
      var pct = parts[k].pct;
      parts[k].weight = weight;
      if (k !== 'assignments') parts[k].points = pct === null ? null : round2((pct / 100) * weight);
    });
    var att = parts.attendance.points || 0;
    var halves = {
      first: round2(att / 2 + parts.assignments.halfPoints[0]),
      second: round2(att / 2 + parts.assignments.halfPoints[1]),
      midterm: parts.midterm.points || 0,
      final: parts.final.points || 0,
      max: {
        first: round2(((num(w.attendance) || 0) + wa) / 2),
        second: round2(((num(w.attendance) || 0) + wa) / 2),
        midterm: num(w.midterm) || 0,
        final: num(w.final) || 0
      }
    };
    var total = round2(halves.first + halves.second + halves.midterm + halves.final);
    var absence = absences(input.attendance, input.heldWeeks, input.attendanceRules);
    var lowest = (input.cutoffs && input.cutoffs.length ? input.cutoffs : DEFAULT_CUTOFFS)
      .slice().sort(function (a, b) { return a[1] - b[1]; })[0][0];
    var got = 0, of = 0, complete = true;
    PARTS.forEach(function (k) {
      if (!parts[k].weight) return;
      if (parts[k].pct === null) { complete = false; return; }
      got += (parts[k].pct / 100) * parts[k].weight;
      of += parts[k].weight;
    });
    var projectedTotal = of ? round2((got / of) * 100) : null;
    return {
      parts: parts, halves: halves, absence: absence, total: total, complete: complete,
      grade: absence.fail ? lowest : complete ? letter(total, input.cutoffs) : null,
      scoreGrade: letter(total, input.cutoffs),
      projectedTotal: projectedTotal,
      projectedGrade: absence.fail ? lowest : projectedTotal === null ? null : letter(projectedTotal, input.cutoffs)
    };
  }

  return {
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    DEFAULT_CUTOFFS: DEFAULT_CUTOFFS,
    DEFAULT_ATTENDANCE_POINTS: DEFAULT_ATTENDANCE_POINTS,
    DEFAULT_ATTENDANCE_RULES: DEFAULT_ATTENDANCE_RULES,
    absences: absences,
    WEEKS: WEEKS,
    PARTS: PARTS,
    num: num,
    round2: round2,
    attendance: attendance,
    assignments: assignments,
    assignmentHalves: assignmentHalves,
    exam: exam,
    letter: letter,
    compute: compute
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Grade;

// ===== server/Code.js =====
/*
 * CMRUScoreSaver — Google Apps Script web app (backend)
 * เว็บ (GitHub Pages) เรียกผ่าน POST { action, payload, idToken } แล้วได้ { ok, data | error } กลับไป
 * สคริปต์รันในนามอาจารย์ (Execute as: Me) จึงเขียน Google Sheet และ Drive ของอาจารย์ได้
 */

// คำสั่งที่มีการเขียนข้อมูล — รันภายใต้ lock เพื่อกันการเขียนชนกัน
var WRITE_ACTIONS = {
  register: 1, finalizeUpload: 1, submitLink: 1, removeFile: 1,
  importRoster: 1, upsertAssignment: 1, deleteAssignment: 1, saveGrades: 1,
  saveAttendance: 1, setAttendanceMarks: 1, saveExams: 1, updateCourse: 1, updateSettings: 1,
  setStudentEmail: 1, addStudent: 1, removeStudent: 1,
  saveGroup: 1, leaveGroup: 1, deleteGroup: 1, deleteCourse: 1,
  saveSyllabus: 1, addSyllabusLink: 1, finalizeSyllabusUpload: 1, removeSyllabusAttachment: 1,
  saveTask: 1, deleteTask: 1,
  submitLeave: 1, finalizeLeaveUpload: 1, cancelLeave: 1, decideLeave: 1
};

function doGet() {
  return json_({ ok: true, data: { service: 'CMRUScoreSaver', time: now_() } });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'คำขอไม่ถูกต้อง' });
  }
  return json_(handleRequest_(req));
}

function handleRequest_(req) {
  try {
    var fn = actions_()[req && req.action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + (req && req.action));
    var run = function () {
      resetCache_();
      var user = authenticate_(req.idToken);
      return fn(user, req.payload || {});
    };
    var data = WRITE_ACTIONS[req.action] ? withLock_(run) : run();
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ===== server/Db.js =====
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
    'groupMax', 'half'],
  Submissions: ['id', 'assignmentId', 'studentId', 'files', 'link', 'submittedAt', 'isLate', 'score', 'feedback', 'gradedAt',
    'groupId'],
  Groups: ['id', 'assignmentId', 'name', 'members', 'createdAt'],
  LeaveRequests: ['id', 'courseCode', 'studentId', 'week', 'date', 'type', 'reason', 'files', 'status', 'note',
    'submittedAt', 'decidedAt', 'prevMark'],
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

// ===== server/Auth.js =====
/*
 * Auth — ตรวจ Google ID token แล้วระบุว่าเป็นอาจารย์หรือนักศึกษาคนไหน
 */

function settings_() {
  if (!_cache.settings) {
    var s = {};
    rows_('Settings').forEach(function (r) { s[r.key] = r.value; });
    _cache.settings = s;
  }
  return _cache.settings;
}

function listSetting_(key) {
  return String(settings_()[key] || '').split(/[,\s]+/)
    .map(function (x) { return x.trim().toLowerCase(); })
    .filter(Boolean);
}

function jsonSetting_(key, fallback) {
  try {
    var v = settings_()[key];
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

/** ตรวจ ID token กับ Google แล้วคืน { email, name } — แคช 10 นาทีเพื่อลดการเรียกซ้ำ */
function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('AUTH: กรุณาเข้าสู่ระบบ');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('AUTH: การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  var info = JSON.parse(res.getContentText());

  var clientId = settings_().clientId;
  if (!clientId) throw new Error('ยังไม่ได้ตั้งค่า clientId ในแท็บ Settings');
  if (info.aud !== clientId) throw new Error('AUTH: โทเคนไม่ได้ออกให้เว็บนี้');
  if (String(info.email_verified) !== 'true') throw new Error('AUTH: อีเมลยังไม่ได้ยืนยัน');
  var ttl = Math.min(Number(info.exp) - Math.floor(Date.now() / 1000) - 30, 600);
  if (!(ttl > 0)) throw new Error('AUTH: การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');

  var ident = { email: String(info.email).toLowerCase(), name: info.name || '' };
  cache.put(key, JSON.stringify(ident), Math.floor(ttl));
  return ident;
}

function authenticate_(idToken) {
  return resolveUser_(verifyIdToken_(idToken));
}

/**
 * อาจารย์ = อีเมลอยู่ใน Settings.teacherEmails
 * นักศึกษา = บัญชีโดเมนมหาวิทยาลัย (Settings.allowedDomains) ที่สมัครแล้ว คือผูกกับรหัสนักศึกษาในแท็บ Students
 *   ยังไม่สมัคร → studentId = null และเว็บจะแสดงหน้าสมัคร (apiRegister_)
 */
function resolveUser_(ident) {
  var email = ident.email;
  if (listSetting_('teacherEmails').indexOf(email) >= 0) {
    return { email: email, name: ident.name, role: 'teacher', courses: [] };
  }
  var domains = listSetting_('allowedDomains');
  if (!domains.length) throw new Error('AUTH_DOMAIN: ระบบยังไม่เปิดรับนักศึกษา (อาจารย์ยังไม่ได้ตั้งค่าโดเมนมหาวิทยาลัย)');
  if (domains.indexOf(email.split('@')[1]) < 0) {
    throw new Error('AUTH_DOMAIN: บัญชีนี้ใช้ไม่ได้ กรุณาเข้าสู่ระบบด้วยบัญชี @' + domains.join(' หรือ @'));
  }

  var mine = rows_('Students').filter(function (r) { return r.email.toLowerCase() === email; });
  return {
    email: email,
    name: ident.name,
    role: 'student',
    studentId: mine.length ? mine[0].studentId : null,
    studentName: mine.length ? mine[0].name : '',
    courses: mine.map(function (r) { return r.courseCode; })
  };
}

/** profile: { nickname, phone } — email ว่าง = รีเซ็ตการสมัคร */
function bindRows_(rows, email, profile) {
  var t = now_();
  rows.forEach(function (r) {
    r.email = email;
    r.boundAt = email ? t : '';
    if (!email) {
      r.nickname = '';
      r.phone = '';
    } else if (profile) {
      r.nickname = profile.nickname;
      r.phone = profile.phone;
    }
    update_('Students', r);
  });
}

/** นับจำนวนครั้งต่อ key ภายในช่วงเวลา — เกิน max แล้วโยน error */
function rateLimit_(key, max, seconds, message) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('rl_' + key) || 0);
  if (n >= max) throw new Error(message);
  return function hit() {
    cache.put('rl_' + key, String(n + 1), seconds);
  };
}

/** PIN ยืนยันการลบ — เก็บเฉพาะ hash + salt ในแท็บ Settings */
function hashPin_(salt, pin) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8));
}

function hasDeletePin_() {
  return !!settings_().deletePinHash;
}

/** ผิดเกิน 5 ครั้ง/ชม. ต่อบัญชี → ล็อก 1 ชม. */
function checkDeletePin_(user, pin) {
  if (!hasDeletePin_()) throw new Error('ยังไม่ได้ตั้ง PIN สำหรับลบ — ตั้งได้ที่แท็บ ตั้งค่า');
  var hit = rateLimit_('pin_' + user.email, 5, 3600, 'ใส่ PIN ผิดหลายครั้งเกินไป กรุณารอ 1 ชั่วโมง');
  var s = settings_();
  if (hashPin_(s.deletePinSalt || '', String(pin || '')) !== s.deletePinHash) {
    hit();
    throw new Error('PIN ไม่ถูกต้อง');
  }
}

function requireTeacher_(user) {
  if (user.role !== 'teacher') throw new Error('เฉพาะอาจารย์เท่านั้น');
}

function requireStudent_(user) {
  if (user.role !== 'student') throw new Error('เฉพาะนักศึกษาเท่านั้น');
  if (!user.studentId) throw new Error('กรุณายืนยันรหัสนักศึกษาก่อน');
}

// ===== server/Api.js =====
/*
 * Api — คำสั่งทั้งหมดที่เว็บเรียกได้
 */

function actions_() {
  return {
    // ทุกคน
    me: apiMe_,
    register: apiRegister_,
    getSyllabus: apiGetSyllabus_,
    timeline: apiTimeline_,
    boardGroups: apiBoardGroups_,
    groupBoard: apiGroupBoard_,
    // นักศึกษา
    myAssignments: apiMyAssignments_,
    myGrades: apiMyGrades_,
    studentDashboard: apiStudentDashboard_,
    myLeaves: apiMyLeaves_,
    submitLeave: apiSubmitLeave_,
    startLeaveUpload: apiStartLeaveUpload_,
    finalizeLeaveUpload: apiFinalizeLeaveUpload_,
    cancelLeave: apiCancelLeave_,
    saveTask: apiSaveTask_,
    deleteTask: apiDeleteTask_,
    startUpload: apiStartUpload_,
    finalizeUpload: apiFinalizeUpload_,
    submitLink: apiSubmitLink_,
    removeFile: apiRemoveFile_,
    leaveGroup: apiLeaveGroup_,
    // นักศึกษา + อาจารย์ (งานกลุ่ม)
    groupOptions: apiGroupOptions_,
    saveGroup: apiSaveGroup_,
    // อาจารย์
    importRoster: apiImportRoster_,
    listStudents: apiListStudents_,
    setStudentEmail: apiSetStudentEmail_,
    addStudent: apiAddStudent_,
    removeStudent: apiRemoveStudent_,
    listAssignments: apiListAssignments_,
    upsertAssignment: apiUpsertAssignment_,
    deleteAssignment: apiDeleteAssignment_,
    deleteGroup: apiDeleteGroup_,
    deleteCourse: apiDeleteCourse_,
    teacherDashboard: apiTeacherDashboard_,
    listLeaves: apiListLeaves_,
    decideLeave: apiDecideLeave_,
    saveSyllabus: apiSaveSyllabus_,
    addSyllabusLink: apiAddSyllabusLink_,
    startSyllabusUpload: apiStartSyllabusUpload_,
    finalizeSyllabusUpload: apiFinalizeSyllabusUpload_,
    removeSyllabusAttachment: apiRemoveSyllabusAttachment_,
    listSubmissions: apiListSubmissions_,
    saveGrades: apiSaveGrades_,
    getAttendance: apiGetAttendance_,
    saveAttendance: apiSaveAttendance_,
    setAttendanceMarks: apiSetAttendanceMarks_,
    getExams: apiGetExams_,
    saveExams: apiSaveExams_,
    gradebook: apiGradebook_,
    updateCourse: apiUpdateCourse_,
    getSettings: apiGetSettings_,
    updateSettings: apiUpdateSettings_
  };
}

/* ---------- helpers ---------- */

function find_(list, pred) {
  for (var i = 0; i < list.length; i++) if (pred(list[i])) return list[i];
  return null;
}

function parseJson_(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch (e) {
    return fallback;
  }
}

function numOrNull_(v) {
  return Grade.num(v);
}

function courseRow_(code) {
  var c = find_(rows_('Courses'), function (r) { return r.courseCode === code; });
  if (!c) throw new Error('ไม่พบวิชา ' + code);
  return c;
}

function courseView_(c) {
  return {
    courseCode: c.courseCode,
    title: c.title,
    section: c.section,
    term: c.term,
    schedule: c.schedule,
    credits: c.credits,
    teacher: c.teacher,
    weights: parseJson_(c.weights, Grade.DEFAULT_WEIGHTS),
    maxMidterm: numOrNull_(c.maxMidterm) || 100,
    maxFinal: numOrNull_(c.maxFinal) || 100,
    gradesVisible: c.gradesVisible === 'true',
    heldWeeks: parseJson_(c.heldWeeks, [])
  };
}

function assignmentRow_(id) {
  var a = find_(rows_('Assignments'), function (r) { return r.id === id; });
  if (!a) throw new Error('ไม่พบงานนี้');
  return a;
}

function assignmentView_(a) {
  return {
    id: a.id,
    courseCode: a.courseCode,
    title: a.title,
    description: a.description,
    maxScore: Number(a.maxScore) || 0,
    dueAt: a.dueAt,
    allowLate: a.allowLate === 'true',
    published: a.published === 'true',
    createdAt: a.createdAt,
    groupMax: isGroupWork_(a) ? Number(a.groupMax) : 0,
    half: a.half === '2' ? 2 : 1,
    overdue: isPastDue_(a)
  };
}

function isPastDue_(a) {
  return !!a.dueAt && new Date(now_()).getTime() > new Date(a.dueAt).getTime();
}

function submissionRow_(assignmentId, studentId) {
  return find_(rows_('Submissions'), function (s) {
    return s.assignmentId === assignmentId && s.studentId === studentId;
  });
}

function submissionView_(s) {
  if (!s) return null;
  return {
    id: s.id,
    files: parseJson_(s.files, []),
    link: s.link,
    submittedAt: s.submittedAt,
    isLate: s.isLate === 'true',
    score: numOrNull_(s.score),
    feedback: s.feedback,
    gradedAt: s.gradedAt
  };
}

function newSubmission_(assignmentId, studentId) {
  return {
    id: uid_('S'), assignmentId: assignmentId, studentId: studentId, files: '[]', link: '',
    submittedAt: '', isLate: '', score: '', feedback: '', gradedAt: '', groupId: ''
  };
}

function rosterOf_(code) {
  return rows_('Students')
    .filter(function (r) { return r.courseCode === code; })
    .sort(function (a, b) { return a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0; });
}

function checkInRoster_(code, studentId) {
  if (!find_(rows_('Students'), function (r) { return r.courseCode === code && r.studentId === studentId; })) {
    throw new Error('ไม่พบรหัส ' + studentId + ' ในรายชื่อวิชา ' + code);
  }
}

function studentView_(r) {
  return {
    studentId: r.studentId, name: r.name, group: r.group, email: r.email, boundAt: r.boundAt,
    nickname: r.nickname || '', phone: r.phone || ''
  };
}

function checkEnrolled_(user, courseCode) {
  if (user.role === 'teacher') return;
  if (user.courses.indexOf(courseCode) < 0) throw new Error('คุณไม่ได้ลงทะเบียนวิชานี้');
}

function settingsView_() {
  var s = settings_();
  return {
    teacherEmails: listSetting_('teacherEmails'),
    allowedDomains: listSetting_('allowedDomains'),
    allowedOrigins: String(s.allowedOrigins || '').split(/[,\s]+/).filter(Boolean),
    gradeCutoffs: jsonSetting_('gradeCutoffs', Grade.DEFAULT_CUTOFFS),
    attendancePoints: jsonSetting_('attendancePoints', Grade.DEFAULT_ATTENDANCE_POINTS),
    attendanceRules: jsonSetting_('attendanceRules', Grade.DEFAULT_ATTENDANCE_RULES),
    uploadMaxMB: Number(s.uploadMaxMB) || 2048,
    hasDeletePin: !!s.deletePinHash
  };
}

function marksOf_(row) {
  var marks = [];
  for (var w = 1; w <= Grade.WEEKS; w++) marks.push(row ? row['w' + w] || '' : '');
  return marks;
}

/** โหลดข้อมูลทั้งวิชาสำหรับคำนวณคะแนน */
function courseData_(code) {
  var course = courseView_(courseRow_(code));
  var assignments = rows_('Assignments')
    .filter(function (a) { return a.courseCode === code && a.published === 'true'; })
    .map(assignmentView_)
    .sort(byDue_);
  var ids = {};
  assignments.forEach(function (a) { ids[a.id] = true; });
  var subs = {};
  rows_('Submissions').forEach(function (s) {
    if (ids[s.assignmentId]) subs[s.assignmentId + '|' + s.studentId] = submissionView_(s);
  });
  var att = {};
  rows_('Attendance').forEach(function (r) { if (r.courseCode === code) att[r.studentId] = marksOf_(r); });
  var exams = {};
  rows_('Exams').forEach(function (r) {
    if (r.courseCode === code) exams[r.studentId] = { midterm: numOrNull_(r.midterm), final: numOrNull_(r.final) };
  });
  return { course: course, assignments: assignments, subs: subs, att: att, exams: exams, settings: settingsView_() };
}

function computeFor_(d, studentId) {
  var ex = d.exams[studentId] || {};
  return Grade.compute({
    weights: d.course.weights,
    cutoffs: d.settings.gradeCutoffs,
    attendancePoints: d.settings.attendancePoints,
    attendanceRules: d.settings.attendanceRules,
    heldWeeks: d.course.heldWeeks,
    attendance: d.att[studentId] || marksOf_(null),
    assignments: d.assignments.map(function (a) {
      var sub = d.subs[a.id + '|' + studentId];
      return { score: sub ? sub.score : null, maxScore: a.maxScore, overdue: a.overdue, half: a.half, submitted: submittedFor_(d, a, studentId) };
    }),
    midterm: ex.midterm,
    maxMidterm: d.course.maxMidterm,
    final: ex.final,
    maxFinal: d.course.maxFinal
  });
}

/** ส่งงานแล้วหรือยัง — งานกลุ่มดูจากงานที่กลุ่มส่ง */
function submittedFor_(d, a, studentId) {
  if (a.groupMax) {
    var m = mergedSubmission_(assignmentRow_(a.id), studentId);
    return !!(m && m.submittedAt);
  }
  var s = d.subs[a.id + '|' + studentId];
  return !!(s && s.submittedAt);
}

function byDue_(a, b) {
  var x = a.dueAt || '9999', y = b.dueAt || '9999';
  return x < y ? -1 : x > y ? 1 : 0;
}

function str_(v, max) {
  return String(v === null || v === undefined ? '' : v).trim().slice(0, max || 500);
}

function scoreInRange_(v, max, label) {
  var n = numOrNull_(v);
  if (v !== '' && v !== null && v !== undefined && n === null) throw new Error(label + ': ต้องเป็นตัวเลข');
  if (n !== null && (n < 0 || n > max)) throw new Error(label + ': ต้องอยู่ระหว่าง 0–' + max);
  return n === null ? '' : String(n);
}

/* ---------- ทุกคน ---------- */

function apiMe_(user) {
  var courses = rows_('Courses').map(courseView_);
  if (user.role === 'student') {
    courses = courses.filter(function (c) { return user.courses.indexOf(c.courseCode) >= 0; });
  }
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    studentId: user.studentId || null,
    studentName: user.studentName || '',
    needsBinding: user.role === 'student' && !user.studentId,
    courses: courses,
    registration: user.role === 'student' && !user.studentId ? registrationInfo_(user) : null,
    warnings: user.role === 'teacher' ? setupWarnings_() : []
  };
}

function setupWarnings_() {
  var w = [];
  if (!listSetting_('allowedDomains').length) {
    w.push('ยังไม่ได้ตั้งโดเมนอีเมลมหาวิทยาลัย — นักศึกษายังสมัครไม่ได้ (ตั้งที่แท็บ ตั้งค่า)');
  }
  return w;
}

/** อีเมลนักศึกษา มรภ.เชียงใหม่ = <รหัสนักศึกษา>@cmru.ac.th → คืนรหัส (หรือ null ถ้าไม่ใช่รูปแบบนี้) */
function emailStudentId_(email) {
  var local = String(email || '').split('@')[0];
  return /^\d{8,13}$/.test(local) ? local : null;
}

/** ข้อมูลสำหรับหน้าสมัครของนักศึกษาที่ยังไม่สมัคร */
function registrationInfo_(user) {
  var id = emailStudentId_(user.email);
  if (!id) return null;
  var rows = rows_('Students').filter(function (r) { return r.studentId === id; });
  if (!rows.length) return { studentId: id, notFound: true };
  var courses = rows_('Courses');
  return {
    studentId: id,
    name: rows[0].name,
    takenByOther: rows.some(function (r) { return r.email && r.email.toLowerCase() !== user.email; }),
    courses: rows.map(function (r) {
      var c = find_(courses, function (x) { return x.courseCode === r.courseCode; });
      return { courseCode: r.courseCode, title: c ? c.title : '' };
    })
  };
}

/** ตัดคำนำหน้าและช่องว่าง เพื่อเทียบชื่อที่กรอกกับชื่อในใบรายชื่อ */
function normalizeName_(s) {
  return String(s || '')
    .replace(/^\s*(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|miss|ms\.?)\s*/i, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** นักศึกษาสมัครเข้าใช้งาน: รหัส + ชื่อ-นามสกุลต้องตรงกับรายชื่อที่อาจารย์นำเข้า */
function apiRegister_(user, p) {
  if (user.role !== 'student') throw new Error('อาจารย์ไม่ต้องสมัคร');
  if (user.studentId) throw new Error('บัญชีนี้สมัครแล้วด้วยรหัส ' + user.studentId);
  var phone = str_(p.phone, 20).replace(/[\s-]/g, '');
  if (phone && !/^\+?\d{9,12}$/.test(phone)) throw new Error('เบอร์โทรไม่ถูกต้อง');
  var rows;

  var fromEmail = emailStudentId_(user.email);
  if (fromEmail) {
    // อีเมลแบบ <รหัส>@cmru.ac.th ยืนยันตัวตนโดย Google แล้ว → ใช้รหัสจากอีเมล ไม่ต้องตรวจชื่อ
    if (p.studentId && str_(p.studentId, 20) !== fromEmail) throw new Error('สมัครได้เฉพาะรหัส ' + fromEmail + ' ตามอีเมลที่ล็อกอิน');
    rows = rows_('Students').filter(function (r) { return r.studentId === fromEmail; });
    if (!rows.length) throw new Error('รหัส ' + fromEmail + ' ยังไม่อยู่ในรายชื่อวิชาใด กรุณาแจ้งอาจารย์');
  } else {
    // อีเมลรูปแบบอื่น → ต้องกรอกรหัส + ชื่อ-นามสกุลให้ตรงกับรายชื่อ
    var hit = rateLimit_('reg_' + user.email, 5, 3600, 'กรอกข้อมูลไม่ถูกต้องหลายครั้งเกินไป กรุณารอ 1 ชั่วโมง หรือติดต่ออาจารย์');
    var id = str_(p.studentId, 20);
    var first = str_(p.firstName, 100), last = str_(p.lastName, 100);
    if (!/^\d{8,13}$/.test(id)) throw new Error('รหัสนักศึกษาต้องเป็นตัวเลข 8–13 หลัก');
    if (!first || !last) throw new Error('กรุณากรอกชื่อและนามสกุล');
    rows = rows_('Students').filter(function (r) { return r.studentId === id; });
    if (!rows.length) {
      hit();
      throw new Error('ไม่พบรหัส ' + id + ' ในรายชื่อลงทะเบียน — ตรวจรหัสอีกครั้ง หรือติดต่ออาจารย์');
    }
    if (normalizeName_(rows[0].name) !== normalizeName_(first + last)) {
      hit();
      throw new Error('ชื่อ-นามสกุลไม่ตรงกับรายชื่อลงทะเบียนของรหัสนี้ (กรอกตามใบรายชื่อของมหาวิทยาลัย ไม่ต้องใส่คำนำหน้า)');
    }
  }
  if (rows.some(function (r) { return r.email && r.email.toLowerCase() !== user.email; })) {
    throw new Error('รหัสนี้ถูกสมัครด้วยบัญชีอื่นแล้ว กรุณาติดต่ออาจารย์');
  }
  bindRows_(rows, user.email, { nickname: str_(p.nickname, 50), phone: phone });
  shareGroupFilesWithStudent_(rows[0].studentId);
  user.studentId = rows[0].studentId;
  user.studentName = rows[0].name;
  user.courses = rows.map(function (r) { return r.courseCode; });
  return apiMe_(user);
}

/* ---------- นักศึกษา ---------- */

function apiMyAssignments_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  return rows_('Assignments')
    .filter(function (a) { return a.courseCode === p.courseCode && a.published === 'true'; })
    .map(function (a) {
      var v = assignmentView_(a);
      v.submission = mergedSubmission_(a, user.studentId);
      if (isGroupWork_(a)) {
        var g = groupOf_(a.id, user.studentId);
        v.group = g ? groupView_(a, g) : null;
      }
      return v;
    })
    .sort(byDue_);
}

function apiMyGrades_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  var d = courseData_(p.courseCode);
  var id = user.studentId;
  var result = computeFor_(d, id);
  var ex = d.exams[id] || {};
  return {
    course: d.course,
    assignments: d.assignments.map(function (a) {
      var s = d.subs[a.id + '|' + id];
      var work = a.groupMax ? mergedSubmission_(assignmentRow_(a.id), id) : s;
      return {
        id: a.id, title: a.title, maxScore: a.maxScore, dueAt: a.dueAt, overdue: a.overdue, groupMax: a.groupMax,
        submitted: !!(work && work.submittedAt), score: s ? s.score : null, feedback: s ? s.feedback : ''
      };
    }),
    attendance: { marks: d.att[id] || marksOf_(null), heldWeeks: d.course.heldWeeks, absence: result.absence },
    exams: { midterm: ex.midterm, final: ex.final, maxMidterm: d.course.maxMidterm, maxFinal: d.course.maxFinal },
    parts: result.parts,
    total: d.course.gradesVisible ? result.total : null,
    grade: d.course.gradesVisible ? result.grade : null,
    gradePending: d.course.gradesVisible && result.grade === null
  };
}

/* ---------- อาจารย์: รายชื่อ ---------- */

function apiImportRoster_(user, p) {
  requireTeacher_(user);
  var c = p.course || {};
  var code = str_(c.courseCode, 20).toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw new Error('รหัสวิชาไม่ถูกต้อง');
  var list = (p.students || []).filter(function (s) { return /^\d{8,13}$/.test(str_(s.studentId)); });
  if (!list.length) throw new Error('ไม่มีรายชื่อนักศึกษา');

  var course = find_(rows_('Courses'), function (r) { return r.courseCode === code; });
  var fields = ['title', 'section', 'term', 'schedule', 'credits', 'teacher'];
  if (!course) {
    course = {
      courseCode: code, weights: JSON.stringify(Grade.DEFAULT_WEIGHTS), maxMidterm: '100', maxFinal: '100',
      gradesVisible: 'false', heldWeeks: '[]'
    };
    fields.forEach(function (f) { course[f] = str_(c[f], 200); });
    insert_('Courses', course);
  } else {
    fields.forEach(function (f) { if (c[f]) course[f] = str_(c[f], 200); });
    update_('Courses', course);
  }

  var students = rows_('Students');
  var existing = {};
  students.forEach(function (r) { if (r.courseCode === code) existing[r.studentId] = r; });
  // ถ้ารหัสนี้ผูกอีเมลไว้แล้วในวิชาอื่น ให้ใช้อีเมลเดียวกัน
  var emailById = {};
  students.forEach(function (r) { if (r.email) emailById[r.studentId] = r; });

  var added = 0, updated = 0, inFile = {};
  list.forEach(function (s) {
    var id = str_(s.studentId);
    inFile[id] = true;
    var r = existing[id];
    if (r) {
      r.name = str_(s.name, 200) || r.name;
      r.group = str_(s.group, 100) || r.group;
      updated++;
    } else {
      var bound = emailById[id];
      students.push({
        courseCode: code, studentId: id, name: str_(s.name, 200), group: str_(s.group, 100),
        email: bound ? bound.email : '', boundAt: bound ? bound.boundAt : '',
        nickname: bound ? bound.nickname : '', phone: bound ? bound.phone : ''
      });
      added++;
    }
  });
  saveAll_('Students');
  var missing = Object.keys(existing).filter(function (id) { return !inFile[id]; })
    .map(function (id) { return studentView_(existing[id]); });
  return { course: courseView_(course), added: added, updated: updated, missing: missing };
}

function apiListStudents_(user, p) {
  requireTeacher_(user);
  return rosterOf_(p.courseCode).map(studentView_);
}

function apiSetStudentEmail_(user, p) {
  requireTeacher_(user);
  var id = str_(p.studentId);
  var email = str_(p.email, 200).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
  var rows = rows_('Students');
  if (email && rows.some(function (r) { return r.email.toLowerCase() === email && r.studentId !== id; })) {
    throw new Error('อีเมลนี้ผูกกับนักศึกษาคนอื่นอยู่');
  }
  var mine = rows.filter(function (r) { return r.studentId === id; });
  if (!mine.length) throw new Error('ไม่พบรหัสนักศึกษา');
  bindRows_(mine, email);
  if (email) shareGroupFilesWithStudent_(id);
  return studentView_(mine[0]);
}

function apiAddStudent_(user, p) {
  requireTeacher_(user);
  courseRow_(p.courseCode);
  var id = str_(p.studentId, 20);
  var name = str_(p.name, 200);
  if (!/^\d{8,13}$/.test(id)) throw new Error('รหัสนักศึกษาต้องเป็นตัวเลข 8–13 หลัก');
  if (!name) throw new Error('กรุณาใส่ชื่อ-นามสกุล');
  var rows = rows_('Students');
  if (find_(rows, function (r) { return r.courseCode === p.courseCode && r.studentId === id; })) {
    throw new Error('รหัสนี้อยู่ในวิชานี้แล้ว');
  }
  // ถ้าสมัครไว้แล้วจากวิชาอื่น ให้ใช้บัญชีเดิม
  var other = find_(rows, function (r) { return r.studentId === id && r.email; });
  var row = {
    courseCode: p.courseCode, studentId: id, name: name, group: str_(p.group, 100),
    email: other ? other.email : '', boundAt: other ? other.boundAt : '',
    nickname: other ? other.nickname : '', phone: other ? other.phone : ''
  };
  insert_('Students', row);
  return studentView_(row);
}

/**
 * ลบวิชาและข้อมูลทั้งหมดของวิชา (รายชื่อ งาน การส่งงาน กลุ่ม เช็คชื่อ คะแนนสอบ) — ต้องใส่ PIN
 * preview: true = นับจำนวนที่จะถูกลบ ไม่ต้องใส่ PIN · trashFiles: ย้ายโฟลเดอร์งานใน Drive ไปถังขยะด้วย (กู้คืนได้ 30 วัน)
 */
function apiDeleteCourse_(user, p) {
  requireTeacher_(user);
  var code = courseRow_(p.courseCode).courseCode;
  var ids = {};
  rows_('Assignments').forEach(function (a) { if (a.courseCode === code) ids[a.id] = true; });
  var inCourse = function (r) { return r.courseCode === code; };
  var ofWork = function (r) { return !!ids[r.assignmentId]; };
  var counts = {
    students: rows_('Students').filter(inCourse).length,
    assignments: Object.keys(ids).length,
    submissions: rows_('Submissions').filter(function (s) { return ofWork(s) && (s.submittedAt || s.score !== ''); }).length,
    leaves: rows_('LeaveRequests').filter(inCourse).length,
    groups: rows_('Groups').filter(ofWork).length
  };
  if (p.preview) return counts;

  checkDeletePin_(user, p.pin);
  remove_('Submissions', ofWork);
  remove_('Groups', ofWork);
  pruneTasks_();
  remove_('Assignments', inCourse);
  remove_('Attendance', inCourse);
  remove_('Exams', inCourse);
  remove_('LeaveRequests', inCourse);
  remove_('Students', inCourse);
  remove_('Courses', inCourse);
  counts.filesTrashed = p.trashFiles ? trashCourseFolder_(code) : false;
  return counts;
}

function apiRemoveStudent_(user, p) {
  requireTeacher_(user);
  var n = remove_('Students', function (r) { return r.courseCode === p.courseCode && r.studentId === p.studentId; });
  var ids = {};
  rows_('Assignments').forEach(function (a) { if (a.courseCode === p.courseCode) ids[a.id] = true; });
  rows_('Groups').forEach(function (g) {
    if (ids[g.assignmentId]) g.members = JSON.stringify(membersOf_(g).filter(function (m) { return m !== p.studentId; }));
  });
  saveAll_('Groups');
  return { removed: n };
}

/* ---------- อาจารย์: งาน ---------- */

function apiListAssignments_(user, p) {
  requireTeacher_(user);
  var roster = rosterOf_(p.courseCode).length;
  var subs = rows_('Submissions');
  return rows_('Assignments')
    .filter(function (a) { return a.courseCode === p.courseCode; })
    .map(function (a) {
      var v = assignmentView_(a);
      var mine = subs.filter(function (s) { return s.assignmentId === a.id; });
      v.counts = {
        roster: roster,
        submitted: mine.filter(function (s) { return s.submittedAt && s.studentId; }).length,
        graded: mine.filter(function (s) { return s.score !== '' && s.studentId; }).length
      };
      if (isGroupWork_(a)) {
        // งานกลุ่ม: นับคนที่กลุ่มส่งแล้ว
        var groups = groupsOf_(a.id);
        v.counts.groups = groups.length;
        v.counts.submitted = groups.reduce(function (n, g) {
          var gs = groupSubmissionRow_(g.id);
          return n + (gs && gs.submittedAt ? membersOf_(g).length : 0);
        }, 0);
      }
      return v;
    })
    .sort(byDue_);
}

function apiUpsertAssignment_(user, p) {
  requireTeacher_(user);
  courseRow_(p.courseCode);
  var title = str_(p.title, 200);
  if (!title) throw new Error('กรุณาใส่ชื่องาน');
  var max = numOrNull_(p.maxScore);
  if (!(max > 0)) throw new Error('คะแนนเต็มต้องมากกว่า 0');
  if (p.dueAt && isNaN(new Date(p.dueAt).getTime())) throw new Error('กำหนดส่งไม่ถูกต้อง');
  var groupMax = numOrNull_(p.groupMax) || 0;
  if (groupMax && (groupMax < 2 || groupMax > 50 || groupMax !== Math.floor(groupMax))) {
    throw new Error('จำนวนสมาชิกสูงสุดต้องเป็นจำนวนเต็ม 2–50');
  }

  var a = p.id ? assignmentRow_(p.id) : { id: uid_('A'), courseCode: p.courseCode, createdAt: now_() };
  if (p.id && !!groupMax !== isGroupWork_(a)) {
    var used = groupsOf_(a.id).length || rows_('Submissions').some(function (s) {
      return s.assignmentId === a.id && (s.submittedAt || s.score !== '');
    });
    if (used) throw new Error('มีการส่งงานหรือจับกลุ่มแล้ว เปลี่ยนระหว่างงานเดี่ยว/งานกลุ่มไม่ได้ — สร้างงานใหม่แทน');
  }
  a.title = title;
  a.description = str_(p.description, 5000);
  a.maxScore = String(max);
  a.dueAt = p.dueAt ? new Date(p.dueAt).toISOString() : '';
  a.allowLate = p.allowLate ? 'true' : 'false';
  a.published = p.published ? 'true' : 'false';
  a.groupMax = groupMax ? String(groupMax) : '';
  a.half = Number(p.half) === 2 ? '2' : '1';
  if (p.id) update_('Assignments', a); else insert_('Assignments', a);
  return assignmentView_(a);
}

function apiDeleteAssignment_(user, p) {
  requireTeacher_(user);
  assignmentRow_(p.id);
  var hasFiles = rows_('Submissions').some(function (s) {
    return s.assignmentId === p.id && (parseJson_(s.files, []).length || s.link);
  });
  if (hasFiles) throw new Error('มีนักศึกษาส่งงานนี้แล้ว ลบไม่ได้ — ใช้ "ซ่อน" แทน');
  remove_('Submissions', function (s) { return s.assignmentId === p.id; });
  remove_('Groups', function (g) { return g.assignmentId === p.id; });
  pruneTasks_();
  remove_('Assignments', function (a) { return a.id === p.id; });
  return { deleted: p.id };
}

function apiListSubmissions_(user, p) {
  requireTeacher_(user);
  var a = assignmentRow_(p.assignmentId);
  var group = isGroupWork_(a);
  return {
    assignment: assignmentView_(a),
    groups: group ? groupsOf_(a.id).map(function (g) { return groupView_(a, g); }) : null,
    rows: rosterOf_(a.courseCode).map(function (r) {
      var v = studentView_(r);
      v.submission = mergedSubmission_(a, r.studentId);
      if (group) {
        var g = groupOf_(a.id, r.studentId);
        v.groupId = g ? g.id : null;
      }
      return v;
    })
  };
}

function apiSaveGrades_(user, p) {
  requireTeacher_(user);
  var a = assignmentRow_(p.assignmentId);
  var max = Number(a.maxScore);
  var subs = rows_('Submissions');
  var t = now_();
  (p.items || []).forEach(function (it) {
    checkInRoster_(a.courseCode, it.studentId);
    var score = scoreInRange_(it.score, max, 'คะแนนของ ' + it.studentId);
    var s = submissionRow_(a.id, it.studentId);
    if (!s) {
      if (score === '' && !it.feedback) return;
      s = newSubmission_(a.id, it.studentId);
      subs.push(s);
    }
    s.score = score;
    s.feedback = str_(it.feedback, 5000);
    s.gradedAt = score === '' ? '' : t;
  });
  saveAll_('Submissions');
  return apiListSubmissions_(user, { assignmentId: a.id });
}

/* ---------- อาจารย์: เช็คชื่อ / สอบ ---------- */

function apiGetAttendance_(user, p) {
  requireTeacher_(user);
  var c = courseView_(courseRow_(p.courseCode));
  var att = {};
  rows_('Attendance').forEach(function (r) { if (r.courseCode === p.courseCode) att[r.studentId] = marksOf_(r); });
  return {
    heldWeeks: c.heldWeeks,
    attendanceRules: settingsView_().attendanceRules,
    pendingLeaves: pendingLeaves_(p.courseCode),
    rows: rosterOf_(p.courseCode).map(function (r) {
      var v = studentView_(r);
      v.marks = att[r.studentId] || marksOf_(null);
      return v;
    })
  };
}

function apiSaveAttendance_(user, p) {
  requireTeacher_(user);
  var course = courseRow_(p.courseCode);
  var rows = rows_('Attendance');
  (p.rows || []).forEach(function (it) {
    checkInRoster_(p.courseCode, it.studentId);
    var r = find_(rows, function (x) { return x.courseCode === p.courseCode && x.studentId === it.studentId; });
    if (!r) {
      r = { courseCode: p.courseCode, studentId: it.studentId };
      rows.push(r);
    }
    for (var w = 1; w <= Grade.WEEKS; w++) {
      var m = String((it.marks || [])[w - 1] || '').toUpperCase();
      if (['', 'P', 'L', 'A', 'E'].indexOf(m) < 0) throw new Error('สถานะเช็คชื่อไม่ถูกต้อง: ' + m);
      r['w' + w] = m;
    }
  });
  saveAll_('Attendance');
  updateHeldWeeks_(course);
  return apiGetAttendance_(user, p);
}

/** สัปดาห์ที่มีการเช็คชื่อแล้ว — สัปดาห์ที่มีแค่ "ลา" (จากใบลาที่อนุมัติล่วงหน้า) ยังไม่นับ */
function updateHeldWeeks_(course) {
  var held = {};
  rows_('Attendance').forEach(function (r) {
    if (r.courseCode !== course.courseCode) return;
    for (var w = 1; w <= Grade.WEEKS; w++) if (r['w' + w] && r['w' + w] !== 'E') held[w] = true;
  });
  var next = JSON.stringify(Object.keys(held).map(Number).sort(function (a, b) { return a - b; }));
  if (next !== course.heldWeeks) {
    course.heldWeeks = next;
    update_('Courses', course);
  }
  return JSON.parse(next);
}

/**
 * บันทึกอัตโนมัติจากหน้าเช็คชื่อ: เขียนเฉพาะช่องที่เปลี่ยน { changes: [{ studentId, week, mark }] }
 * ช่องอื่นไม่ถูกแตะ — ส่งซ้ำได้ (เช่น กู้คืนจากเครื่องแล้วส่งใหม่) และไม่ทับ "ลา" ที่อนุมัติระหว่างนั้น
 */
function apiSetAttendanceMarks_(user, p) {
  requireTeacher_(user);
  var course = courseRow_(p.courseCode);
  var changes = p.changes || [];
  if (changes.length > 5000) throw new Error('เปลี่ยนพร้อมกันมากเกินไป');
  var roster = {};
  rosterOf_(p.courseCode).forEach(function (r) { roster[r.studentId] = true; });
  // ตรวจทั้งชุดก่อน แล้วค่อยเขียน — ช่องผิดช่องเดียว = ไม่บันทึกเลย
  var clean = changes.map(function (c) {
    var id = str_(c.studentId, 20);
    if (!roster[id]) throw new Error('ไม่พบรหัส ' + id + ' ในรายชื่อวิชา ' + p.courseCode);
    var w = Number(c.week);
    if (!(w >= 1 && w <= Grade.WEEKS && w === Math.floor(w))) throw new Error('สัปดาห์ไม่ถูกต้อง: ' + c.week);
    var m = String(c.mark || '').toUpperCase();
    if (['', 'P', 'L', 'A', 'E'].indexOf(m) < 0) throw new Error('สถานะเช็คชื่อไม่ถูกต้อง: ' + m);
    return { id: id, w: w, m: m };
  });
  var rows = rows_('Attendance');
  clean.forEach(function (c) {
    var r = find_(rows, function (x) { return x.courseCode === p.courseCode && x.studentId === c.id; });
    if (!r) {
      r = { courseCode: p.courseCode, studentId: c.id };
      for (var k = 1; k <= Grade.WEEKS; k++) r['w' + k] = '';
      rows.push(r);
    }
    r['w' + c.w] = c.m;
  });
  if (changes.length) saveAll_('Attendance');
  return { saved: changes.length, heldWeeks: updateHeldWeeks_(course), savedAt: now_() };
}

function apiGetExams_(user, p) {
  requireTeacher_(user);
  var c = courseView_(courseRow_(p.courseCode));
  var ex = {};
  rows_('Exams').forEach(function (r) { if (r.courseCode === p.courseCode) ex[r.studentId] = r; });
  return {
    maxMidterm: c.maxMidterm,
    maxFinal: c.maxFinal,
    rows: rosterOf_(p.courseCode).map(function (r) {
      var v = studentView_(r);
      var e = ex[r.studentId];
      v.midterm = e ? numOrNull_(e.midterm) : null;
      v.final = e ? numOrNull_(e.final) : null;
      return v;
    })
  };
}

function apiSaveExams_(user, p) {
  requireTeacher_(user);
  var course = courseRow_(p.courseCode);
  var maxM = numOrNull_(p.maxMidterm), maxF = numOrNull_(p.maxFinal);
  if (!(maxM > 0) || !(maxF > 0)) throw new Error('คะแนนเต็มสอบต้องมากกว่า 0');
  course.maxMidterm = String(maxM);
  course.maxFinal = String(maxF);
  update_('Courses', course);
  var rows = rows_('Exams');
  (p.rows || []).forEach(function (it) {
    checkInRoster_(p.courseCode, it.studentId);
    var mid = scoreInRange_(it.midterm, maxM, 'กลางภาคของ ' + it.studentId);
    var fin = scoreInRange_(it.final, maxF, 'ปลายภาคของ ' + it.studentId);
    var r = find_(rows, function (x) { return x.courseCode === p.courseCode && x.studentId === it.studentId; });
    if (!r) {
      if (mid === '' && fin === '') return;
      r = { courseCode: p.courseCode, studentId: it.studentId };
      rows.push(r);
    }
    r.midterm = mid;
    r.final = fin;
  });
  saveAll_('Exams');
  return apiGetExams_(user, p);
}

/* ---------- อาจารย์: สมุดคะแนน / ตั้งค่า ---------- */

function apiGradebook_(user, p) {
  requireTeacher_(user);
  var d = courseData_(p.courseCode);
  return {
    course: d.course,
    settings: d.settings,
    assignments: d.assignments,
    students: rosterOf_(p.courseCode).map(function (r) {
      var v = studentView_(r);
      v.attendance = d.att[r.studentId] || marksOf_(null);
      v.exams = d.exams[r.studentId] || { midterm: null, final: null };
      v.scores = {};
      v.submitted = {};
      d.assignments.forEach(function (a) {
        var s = d.subs[a.id + '|' + r.studentId];
        v.scores[a.id] = s ? s.score : null;
        v.submitted[a.id] = submittedFor_(d, a, r.studentId);
      });
      v.result = computeFor_(d, r.studentId);
      return v;
    })
  };
}

function apiUpdateCourse_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  if (p.weights) {
    var w = {};
    Grade.PARTS.forEach(function (k) {
      var n = numOrNull_(p.weights[k]);
      if (n === null || n < 0) throw new Error('น้ำหนักคะแนนต้องเป็นตัวเลข ≥ 0');
      w[k] = n;
    });
    c.weights = JSON.stringify(w);
  }
  if (p.gradesVisible !== undefined) c.gradesVisible = p.gradesVisible ? 'true' : 'false';
  if (p.title) c.title = str_(p.title, 200);
  update_('Courses', c);
  return courseView_(c);
}

function apiGetSettings_(user) {
  requireTeacher_(user);
  return settingsView_();
}

function apiUpdateSettings_(user, p) {
  requireTeacher_(user);
  var updates = {};
  if (p.teacherEmails) {
    var t = p.teacherEmails.map(function (e) { return str_(e).toLowerCase(); }).filter(Boolean);
    if (t.indexOf(user.email) < 0) throw new Error('ต้องมีอีเมลของคุณเองอยู่ในรายชื่ออาจารย์');
    updates.teacherEmails = t.join(',');
  }
  if (p.allowedDomains) updates.allowedDomains = p.allowedDomains.map(function (d) { return str_(d).toLowerCase().replace(/^@/, ''); }).filter(Boolean).join(',');
  if (p.allowedOrigins) updates.allowedOrigins = p.allowedOrigins.map(function (o) { return str_(o).replace(/\/+$/, ''); }).filter(Boolean).join(',');
  if (p.gradeCutoffs) {
    var cut = p.gradeCutoffs.map(function (g) { return [str_(g[0], 5), Number(g[1])]; });
    if (cut.some(function (g) { return !g[0] || !isFinite(g[1]); })) throw new Error('เกณฑ์เกรดไม่ถูกต้อง');
    updates.gradeCutoffs = JSON.stringify(cut);
  }
  if (p.attendancePoints) {
    var pts = {};
    ['P', 'L', 'E', 'A'].forEach(function (k) {
      var n = numOrNull_(p.attendancePoints[k]);
      if (n === null || n < 0 || n > 1) throw new Error('คะแนนเช็คชื่อต้องอยู่ระหว่าง 0–1');
      pts[k] = n;
    });
    updates.attendancePoints = JSON.stringify(pts);
  }
  if (p.deletePin) {
    // เปลี่ยน PIN ต้องใส่ PIN เดิมก่อน (ลืม PIN: ลบค่า deletePinHash ในแท็บ Settings ของ Google Sheet)
    if (hasDeletePin_()) checkDeletePin_(user, p.deletePin.current);
    var pin = str_(p.deletePin.next, 20);
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 4–8 หลัก');
    updates.deletePinSalt = uid_('P');
    updates.deletePinHash = hashPin_(updates.deletePinSalt, pin);
  }
  if (p.attendanceRules) {
    var ar = {};
    [['failAbove', 0, 16], ['warnAt', 0, 16], ['latePerAbsence', 0, 16]].forEach(function (x) {
      var n = numOrNull_(p.attendanceRules[x[0]]);
      if (n === null || n < x[1] || n > x[2] || n !== Math.floor(n)) throw new Error('เกณฑ์การขาดเรียนต้องเป็นจำนวนเต็ม 0–16');
      ar[x[0]] = n;
    });
    updates.attendanceRules = JSON.stringify(ar);
  }
  if (p.uploadMaxMB !== undefined) {
    var mb = numOrNull_(p.uploadMaxMB);
    if (!(mb > 0)) throw new Error('ขนาดไฟล์สูงสุดไม่ถูกต้อง');
    updates.uploadMaxMB = String(mb);
  }
  var rows = rows_('Settings');
  Object.keys(updates).forEach(function (k) {
    var r = find_(rows, function (x) { return x.key === k; });
    if (r) {
      r.value = updates[k];
      update_('Settings', r);
    } else {
      insert_('Settings', { key: k, value: updates[k] });
    }
  });
  _cache.settings = null;
  return settingsView_();
}

// ===== server/Upload.js =====
/*
 * Upload — ส่งงานเข้า Google Drive ของอาจารย์
 *
 * ไฟล์ใหญ่: สคริปต์เปิด "resumable upload session" ของ Drive ด้วยสิทธิ์อาจารย์ แล้วส่งแค่ URL ของ session
 * ให้เบราว์เซอร์ → เบราว์เซอร์อัปโหลดเป็นชิ้นตรงไปที่ Google (ไม่ผ่าน Apps Script, ไม่จำกัด 50MB)
 * URL นี้ใช้ได้กับไฟล์นี้ไฟล์เดียว และไม่เปิดเผย token ของอาจารย์
 */

var MAX_FILES_PER_SUBMISSION = 20;

function checkCanSubmit_(a, t) {
  if (a.published !== 'true') throw new Error('งานนี้ยังไม่เปิดให้ส่ง');
  if (t.graded) throw new Error('งานนี้ตรวจให้คะแนนแล้ว แก้ไขไม่ได้ (ติดต่ออาจารย์)');
  if (isPastDue_(a) && a.allowLate !== 'true') throw new Error('เลยกำหนดส่งแล้ว');
}

/**
 * แถว Submissions ที่การส่งงานครั้งนี้จะเขียน — งานเดี่ยว: แถวของนักศึกษา, งานกลุ่ม: แถวของกลุ่ม
 * sub อาจเป็น null (ยังไม่เคยส่ง) — ใช้ t.create() สร้างแถวใหม่
 */
function submitTarget_(user, a) {
  var st = studentRow_(a.courseCode, user.studentId);
  if (!isGroupWork_(a)) {
    var own = submissionRow_(a.id, user.studentId);
    return {
      sub: own,
      graded: !!(own && own.score !== ''),
      folderName: st.studentId + ' ' + st.name,
      props: { assignmentId: a.id, studentId: user.studentId },
      create: function () { return newSubmission_(a.id, user.studentId); },
      share: function (fileId) { shareReader_(fileId, user.email); },
      owns: function (props) { return props.studentId === user.studentId && !props.groupId; }
    };
  }
  var g = groupOf_(a.id, user.studentId);
  if (!g) throw new Error('งานกลุ่ม — เข้ากลุ่มหรือสร้างกลุ่มก่อนส่งงาน');
  return {
    sub: groupSubmissionRow_(g.id),
    graded: groupGraded_(a, g),
    folderName: 'กลุ่ม ' + g.name + ' [' + g.id + ']',
    props: { assignmentId: a.id, groupId: g.id },
    create: function () { return newGroupSubmission_(a.id, g.id); },
    share: function (fileId) { shareGroupFiles_(g, null, [fileId]); },
    owns: function (props) { return props.groupId === g.id; }
  };
}

function studentRow_(courseCode, studentId) {
  return find_(rows_('Students'), function (r) { return r.courseCode === courseCode && r.studentId === studentId; });
}

function safeName_(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150) || 'file';
}

function apiStartUpload_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var t = submitTarget_(user, a);
  var sub = t.sub;
  checkCanSubmit_(a, t);
  if (sub && parseJson_(sub.files, []).length >= MAX_FILES_PER_SUBMISSION) {
    throw new Error('ส่งได้สูงสุด ' + MAX_FILES_PER_SUBMISSION + ' ไฟล์ต่องาน');
  }
  var size = Number(p.size);
  var maxMB = settingsView_().uploadMaxMB;
  if (!(size > 0)) throw new Error('ไฟล์ว่างเปล่า');
  if (size > maxMB * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน ' + maxMB + ' MB');
  var origin = String(p.origin || '').replace(/\/+$/, '');
  if (settingsView_().allowedOrigins.indexOf(origin) < 0) {
    throw new Error('เว็บไซต์ ' + origin + ' ไม่ได้รับอนุญาตให้อัปโหลด (ตั้งค่า allowedOrigins)');
  }

  var st = studentRow_(a.courseCode, user.studentId);
  var folderId = submissionFolderId_(a, t.folderName);
  var uploadUrl = startResumable_({
    folderId: folderId,
    name: safeName_(p.fileName),
    mimeType: String(p.mimeType || 'application/octet-stream'),
    size: size,
    origin: origin,
    description: 'ส่งโดย ' + st.name + ' (' + st.studentId + ') ' + user.email,
    appProperties: t.props
  });
  return { uploadUrl: uploadUrl };
}

function apiFinalizeUpload_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var t = submitTarget_(user, a);
  var f = getDriveFile_(String(p.fileId || ''));
  var props = (f && f.appProperties) || {};
  if (!f || f.trashed || props.assignmentId !== a.id || !t.owns(props)) {
    throw new Error('ไม่พบไฟล์ที่อัปโหลด');
  }
  var sub = t.sub || t.create();
  var files = parseJson_(sub.files, []);
  var added = !files.some(function (x) { return x.id === f.id; });
  if (added) files.push({ id: f.id, name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType });
  markSubmitted_(a, sub, files);
  if (added) t.share(f.id);
  return mergedSubmission_(a, user.studentId);
}

function apiSubmitLink_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var t = submitTarget_(user, a);
  checkCanSubmit_(a, t);
  var link = str_(p.link, 2000);
  if (link && !/^https:\/\/[^\s]+$/.test(link)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://');
  var sub = t.sub || t.create();
  sub.link = link;
  markSubmitted_(a, sub, parseJson_(sub.files, []));
  return mergedSubmission_(a, user.studentId);
}

function apiRemoveFile_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var t = submitTarget_(user, a);
  var sub = t.sub;
  checkCanSubmit_(a, t);
  var files = sub ? parseJson_(sub.files, []) : [];
  var keep = files.filter(function (x) { return x.id !== p.fileId; });
  if (keep.length === files.length) throw new Error('ไม่พบไฟล์');
  trashFile_(p.fileId);
  markSubmitted_(a, sub, keep);
  return mergedSubmission_(a, user.studentId);
}

function markSubmitted_(a, sub, files) {
  sub.files = JSON.stringify(files);
  if (files.length || sub.link) {
    sub.submittedAt = now_();
    sub.isLate = isPastDue_(a) ? 'true' : 'false';
  } else {
    sub.submittedAt = '';
    sub.isLate = '';
  }
  update_('Submissions', sub);
}

/* ---------- Google Drive (โหมดทดลองเขียนทับฟังก์ชันชุดนี้) ---------- */

function driveFetch_(method, url, body, headers) {
  var opt = {
    method: method,
    muteHttpExceptions: true,
    headers: Object.assign({ Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, headers || {})
  };
  if (body) {
    opt.contentType = 'application/json; charset=UTF-8';
    opt.payload = JSON.stringify(body);
  }
  return UrlFetchApp.fetch(url, opt);
}

/** โฟลเดอร์: <root>/<รหัสวิชา>/<งาน>/<รหัส ชื่อ | กลุ่ม ชื่อกลุ่ม> — จำ id ไว้ใน Script Properties */
function ensureFolder_(parentId, name) {
  var props = PropertiesService.getScriptProperties();
  var key = 'folder_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, parentId + '/' + name, Utilities.Charset.UTF_8));
  var id = props.getProperty(key);
  if (id) {
    try {
      if (!DriveApp.getFolderById(id).isTrashed()) return id;
    } catch (e) { /* โฟลเดอร์ถูกลบ — สร้างใหม่ */ }
  }
  var parent = DriveApp.getFolderById(parentId);
  var it = parent.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : parent.createFolder(name);
  props.setProperty(key, folder.getId());
  return folder.getId();
}

function submissionFolderId_(a, folderName) {
  var root = settings_().rootFolderId;
  if (!root) throw new Error('ยังไม่ได้ตั้งค่า rootFolderId — รัน setup()');
  var course = ensureFolder_(root, a.courseCode);
  var work = ensureFolder_(course, safeName_(a.title + ' [' + a.id + ']'));
  return ensureFolder_(work, safeName_(folderName));
}

function startResumable_(o) {
  var res = driveFetch_('post',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType',
    { name: o.name, parents: [o.folderId], description: o.description, appProperties: o.appProperties },
    { 'X-Upload-Content-Type': o.mimeType, 'X-Upload-Content-Length': String(o.size), Origin: o.origin });
  var h = res.getHeaders();
  var url = h.Location || h.location;
  if (res.getResponseCode() !== 200 || !url) {
    throw new Error('เปิดการอัปโหลดไม่สำเร็จ (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
  }
  return url;
}

function getDriveFile_(id) {
  if (!/^[\w-]{10,}$/.test(id)) return null;
  var res = driveFetch_('get', 'https://www.googleapis.com/drive/v3/files/' + id +
    '?fields=id,name,size,mimeType,trashed,appProperties');
  return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
}

/** ให้สิทธิ์ "ผู้ดู" กับเจ้าของงานคนเดียว (ไม่ส่งอีเมลแจ้ง) */
function shareReader_(id, email) {
  var res = driveFetch_('post', 'https://www.googleapis.com/drive/v3/files/' + id +
    '/permissions?sendNotificationEmail=false', { role: 'reader', type: 'user', emailAddress: email });
  if (res.getResponseCode() !== 200) {
    console.warn('share failed ' + id + ' ' + email + ': ' + res.getContentText());
  }
}

function trashFile_(id) {
  DriveApp.getFileById(id).setTrashed(true);
}

/** <root>/<รหัสวิชา>/ใบลา/<รหัส ชื่อ> */
function leaveFolderId_(courseCode, folderName) {
  var root = settings_().rootFolderId;
  if (!root) throw new Error('ยังไม่ได้ตั้งค่า rootFolderId — รัน setup()');
  return ensureFolder_(ensureFolder_(ensureFolder_(root, courseCode), 'ใบลา'), safeName_(folderName));
}

function syllabusFolderId_(courseCode) {
  var root = settings_().rootFolderId;
  if (!root) throw new Error('ยังไม่ได้ตั้งค่า rootFolderId — รัน setup()');
  return ensureFolder_(ensureFolder_(root, courseCode), 'Syllabus');
}

/** ทุกคนที่มีลิงก์ดูได้ — ใช้กับไฟล์ syllabus เท่านั้น (งานของนักศึกษาแชร์เฉพาะเจ้าของ) */
function shareAnyoneReader_(id) {
  var res = driveFetch_('post', 'https://www.googleapis.com/drive/v3/files/' + id + '/permissions',
    { role: 'reader', type: 'anyone' });
  if (res.getResponseCode() !== 200) console.warn('share anyone failed ' + id + ': ' + res.getContentText());
}

/** ย้ายโฟลเดอร์ <root>/<รหัสวิชา> ไปถังขยะ — คืน true ถ้าพบโฟลเดอร์ */
function trashCourseFolder_(courseCode) {
  var root = settings_().rootFolderId;
  if (!root) return false;
  var it = DriveApp.getFolderById(root).getFoldersByName(courseCode);
  var found = false;
  while (it.hasNext()) {
    it.next().setTrashed(true);
    found = true;
  }
  return found;
}

// ===== server/Groups.js =====
/*
 * Groups — งานกลุ่ม
 * งานที่ตั้ง groupMax ≥ 2 = งานกลุ่ม: นักศึกษาจับกลุ่มเองแยกตามงาน (อาจารย์แก้ได้)
 * ไฟล์/ลิงก์ของกลุ่มอยู่ในแถว Submissions ที่มี groupId (studentId ว่าง)
 * ส่วนคะแนน/ความเห็นยังอยู่ในแถวของนักศึกษาแต่ละคน → สูตรเกรดและสมุดคะแนนไม่ต้องรู้จักกลุ่ม
 */

function isGroupWork_(a) {
  return (Number(a.groupMax) || 0) >= 2;
}

function groupsOf_(assignmentId) {
  return rows_('Groups').filter(function (g) { return g.assignmentId === assignmentId; });
}

function membersOf_(g) {
  return parseJson_(g.members, []);
}

function groupOf_(assignmentId, studentId) {
  return find_(groupsOf_(assignmentId), function (g) { return membersOf_(g).indexOf(studentId) >= 0; });
}

function groupRow_(id) {
  var g = find_(rows_('Groups'), function (r) { return r.id === id; });
  if (!g) throw new Error('ไม่พบกลุ่มนี้');
  return g;
}

function groupSubmissionRow_(groupId) {
  return find_(rows_('Submissions'), function (s) { return s.groupId === groupId && !s.studentId; });
}

function newGroupSubmission_(assignmentId, groupId) {
  var s = newSubmission_(assignmentId, '');
  s.groupId = groupId;
  return s;
}

/** ให้คะแนนสมาชิกคนใดคนหนึ่งแล้ว = กลุ่มนี้ตรวจแล้ว */
function groupGraded_(a, g) {
  return membersOf_(g).some(function (id) {
    var s = submissionRow_(a.id, id);
    return s && s.score !== '';
  });
}

function groupView_(a, g) {
  var roster = {};
  rosterOf_(a.courseCode).forEach(function (r) { roster[r.studentId] = r; });
  return {
    id: g.id,
    name: g.name,
    members: membersOf_(g).map(function (id) {
      return { studentId: id, name: roster[id] ? roster[id].name : '(ไม่อยู่ในรายชื่อแล้ว)' };
    }),
    submission: submissionView_(groupSubmissionRow_(g.id))
  };
}

/** แถวที่นักศึกษาเห็นเป็น "งานของฉัน": ไฟล์/ลิงก์ของกลุ่ม + คะแนน/ความเห็นของตัวเอง */
function mergedSubmission_(a, studentId) {
  var own = submissionView_(submissionRow_(a.id, studentId));
  if (!isGroupWork_(a)) return own;
  var g = groupOf_(a.id, studentId);
  var work = g ? submissionView_(groupSubmissionRow_(g.id)) : null;
  if (!work && !own) return null;
  var v = work || submissionView_(newSubmission_(a.id, studentId));
  v.score = own ? own.score : null;
  v.feedback = own ? own.feedback : '';
  v.gradedAt = own ? own.gradedAt : '';
  return v;
}

/**
 * แชร์ไฟล์ของกลุ่มให้สมาชิกที่สมัครแล้ว
 * studentIds: เฉพาะคนเหล่านี้ (ค่าเริ่มต้น = ทุกคนในกลุ่ม) · fileIds: เฉพาะไฟล์เหล่านี้ (ค่าเริ่มต้น = ทุกไฟล์ของกลุ่ม)
 */
function shareGroupFiles_(g, studentIds, fileIds) {
  var ids = studentIds || membersOf_(g);
  if (!fileIds) {
    var sub = groupSubmissionRow_(g.id);
    fileIds = (sub ? parseJson_(sub.files, []) : []).map(function (f) { return f.id; });
  }
  if (!fileIds.length || !ids.length) return;
  var emails = {};
  rows_('Students').forEach(function (r) {
    if (r.email && ids.indexOf(r.studentId) >= 0 && membersOf_(g).indexOf(r.studentId) >= 0) emails[r.email.toLowerCase()] = true;
  });
  Object.keys(emails).forEach(function (e) {
    fileIds.forEach(function (id) { shareReader_(id, e); });
  });
}

/** หลังผูกบัญชี: ให้เห็นไฟล์ของกลุ่มที่เพื่อนส่งไว้ก่อนแล้ว */
function shareGroupFilesWithStudent_(studentId) {
  rows_('Groups').forEach(function (g) {
    if (membersOf_(g).indexOf(studentId) >= 0) shareGroupFiles_(g, [studentId]);
  });
}

function checkGroupEditable_(a) {
  if (a.published !== 'true') throw new Error('งานนี้ยังไม่เปิด');
  if (isPastDue_(a) && a.allowLate !== 'true') throw new Error('เลยกำหนดส่งแล้ว แก้กลุ่มไม่ได้ (ติดต่ออาจารย์)');
}

/* ---------- คำสั่ง ---------- */

/** รายชื่อเพื่อนในวิชาและกลุ่มที่แต่ละคนอยู่ — ใช้ตอนสร้าง/แก้กลุ่ม */
function apiGroupOptions_(user, p) {
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  if (!isGroupWork_(a)) throw new Error('งานนี้ไม่ใช่งานกลุ่ม');
  if (user.role !== 'teacher' && a.published !== 'true') throw new Error('งานนี้ยังไม่เปิด');
  var groupName = {};
  var groupId = {};
  groupsOf_(a.id).forEach(function (g) {
    membersOf_(g).forEach(function (id) { groupName[id] = g.name; groupId[id] = g.id; });
  });
  return {
    groupMax: Number(a.groupMax),
    students: rosterOf_(a.courseCode).map(function (r) {
      return { studentId: r.studentId, name: r.name, groupId: groupId[r.studentId] || null, groupName: groupName[r.studentId] || null };
    })
  };
}

/**
 * สร้าง/แก้กลุ่ม: { assignmentId, groupId?, name, members: [studentId] }
 * นักศึกษา: ต้องเป็นสมาชิกของกลุ่ม, ไม่เกิน groupMax, เพื่อนที่อยู่กลุ่มอื่นแล้วเลือกไม่ได้, กลุ่มที่ตรวจแล้วแก้ไม่ได้
 * อาจารย์: ย้ายคนจากกลุ่มอื่นได้ และเกิน groupMax ได้
 */
function apiSaveGroup_(user, p) {
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  if (!isGroupWork_(a)) throw new Error('งานนี้ไม่ใช่งานกลุ่ม');
  var teacher = user.role === 'teacher';
  if (!teacher) {
    requireStudent_(user);
    checkGroupEditable_(a);
  }
  var name = str_(p.name, 100);
  if (!name) throw new Error('กรุณาตั้งชื่อกลุ่ม');

  var members = [];
  (p.members || []).forEach(function (id) {
    id = str_(id, 20);
    if (id && members.indexOf(id) < 0) members.push(id);
  });
  if (!teacher && members.indexOf(user.studentId) < 0) members.unshift(user.studentId);
  if (!members.length) throw new Error('กลุ่มต้องมีสมาชิกอย่างน้อย 1 คน');
  members.forEach(function (id) { checkInRoster_(a.courseCode, id); });
  var max = Number(a.groupMax);
  if (!teacher && members.length > max) throw new Error('กลุ่มมีได้สูงสุด ' + max + ' คน');

  var g;
  var before = [];
  if (p.groupId) {
    g = groupRow_(p.groupId);
    if (g.assignmentId !== a.id) throw new Error('ไม่พบกลุ่มนี้');
    if (!teacher && membersOf_(g).indexOf(user.studentId) < 0) throw new Error('คุณไม่ได้อยู่ในกลุ่มนี้');
    if (!teacher && groupGraded_(a, g)) throw new Error('กลุ่มนี้ตรวจให้คะแนนแล้ว แก้ไม่ได้ (ติดต่ออาจารย์)');
    before = membersOf_(g);
  } else if (!teacher && groupOf_(a.id, user.studentId)) {
    throw new Error('คุณอยู่ในกลุ่มอื่นของงานนี้แล้ว');
  }
  if (groupsOf_(a.id).some(function (x) { return x !== g && x.name.toLowerCase() === name.toLowerCase(); })) {
    throw new Error('มีกลุ่มชื่อ "' + name + '" แล้ว');
  }

  var others = groupsOf_(a.id).filter(function (x) { return x !== g; });
  members.forEach(function (id) {
    var other = find_(others, function (x) { return membersOf_(x).indexOf(id) >= 0; });
    if (!other) return;
    if (!teacher) throw new Error(id + ' อยู่กลุ่ม "' + other.name + '" แล้ว');
    other.members = JSON.stringify(membersOf_(other).filter(function (m) { return m !== id; }));
  });

  if (g) {
    g.name = name;
    g.members = JSON.stringify(members);
  } else {
    g = { id: uid_('G'), assignmentId: a.id, name: name, members: JSON.stringify(members), createdAt: now_() };
    rows_('Groups').push(g);
  }
  // กลุ่มที่ถูกย้ายสมาชิกออกจนว่าง และยังไม่มีงาน → ลบทิ้ง
  remove_('Groups', function (x) {
    return x.assignmentId === a.id && !membersOf_(x).length && !hasWork_(groupSubmissionRow_(x.id));
  });
  saveAll_('Groups');
  pruneTasks_();
  shareGroupFiles_(g, members.filter(function (id) { return before.indexOf(id) < 0; }));
  return groupView_(a, g);
}

function hasWork_(sub) {
  return !!(sub && (parseJson_(sub.files, []).length || sub.link));
}

function apiLeaveGroup_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  checkGroupEditable_(a);
  var g = groupOf_(a.id, user.studentId);
  if (!g) throw new Error('คุณยังไม่ได้อยู่ในกลุ่ม');
  if (groupGraded_(a, g)) throw new Error('กลุ่มนี้ตรวจให้คะแนนแล้ว ออกไม่ได้ (ติดต่ออาจารย์)');
  var left = membersOf_(g).filter(function (id) { return id !== user.studentId; });
  if (!left.length && hasWork_(groupSubmissionRow_(g.id))) {
    throw new Error('คุณเป็นสมาชิกคนสุดท้าย — ลบไฟล์/ลิงก์ที่ส่งไว้ก่อนออกจากกลุ่ม');
  }
  g.members = JSON.stringify(left);
  if (left.length) update_('Groups', g);
  else {
    remove_('Submissions', function (s) { return s.groupId === g.id && !s.studentId; });
    remove_('Groups', function (x) { return x.id === g.id; });
    pruneTasks_();
  }
  return { left: g.id };
}

function apiDeleteGroup_(user, p) {
  requireTeacher_(user);
  var g = groupRow_(p.groupId);
  if (hasWork_(groupSubmissionRow_(g.id))) throw new Error('กลุ่มนี้ส่งงานแล้ว ลบไม่ได้ — ย้ายสมาชิกไปกลุ่มอื่นแทน');
  remove_('Submissions', function (s) { return s.groupId === g.id && !s.studentId; });
  remove_('Groups', function (x) { return x.id === g.id; });
  pruneTasks_();
  return { deleted: g.id };
}

// ===== server/Syllabus.js =====
/*
 * Syllabus — เค้าโครงรายวิชา: เนื้อหาที่อาจารย์เขียนในเว็บ + ไฟล์/ลิงก์แนบ
 * เก็บเป็น JSON ในคอลัมน์ Courses.syllabus (เซลล์ Google Sheet รับได้ไม่เกิน 50,000 ตัวอักษร)
 * ไฟล์แนบอยู่ใน <root>/<รหัสวิชา>/Syllabus และแชร์แบบ "ทุกคนที่มีลิงก์ดูได้" (ไม่ใช่ข้อมูลส่วนตัว)
 */

var SYLLABUS_MAX_ATTACHMENTS = 20;
// ตามหัวข้อแนวการสอนของมหาวิทยาลัย
var SYLLABUS_TEXT_FIELDS = {
  description: 5000, objectives: 5000, scope: 5000, activities: 5000, materials: 5000,
  assessment: 3000, rules: 3000, contact: 2000
};

function emptySyllabus_() {
  var weeks = [];
  for (var w = 0; w < Grade.WEEKS; w++) weeks.push({ topic: '', detail: '' });
  return { description: '', objectives: '', materials: '', contact: '', weeks: weeks, attachments: [] };
}

function syllabusOf_(c) {
  var s = emptySyllabus_();
  var saved = parseJson_(c.syllabus, {});
  Object.keys(SYLLABUS_TEXT_FIELDS).forEach(function (k) { if (saved[k]) s[k] = String(saved[k]); });
  (saved.weeks || []).slice(0, Grade.WEEKS).forEach(function (w, i) {
    s.weeks[i] = { topic: String((w && w.topic) || ''), detail: String((w && w.detail) || '') };
  });
  s.attachments = Array.isArray(saved.attachments) ? saved.attachments : [];
  return s;
}

function writeSyllabus_(c, s) {
  var json = JSON.stringify(s);
  if (json.length > 45000) throw new Error('เนื้อหา syllabus ยาวเกินไป — ย่อเนื้อหา หรือแนบเป็นไฟล์แทน');
  c.syllabus = json;
  c.syllabusUpdatedAt = now_();
  update_('Courses', c);
}

function syllabusView_(c) {
  return { course: courseView_(c), syllabus: syllabusOf_(c), updatedAt: c.syllabusUpdatedAt || '', gradeCutoffs: settingsView_().gradeCutoffs };
}

function apiGetSyllabus_(user, p) {
  checkEnrolled_(user, p.courseCode);
  return syllabusView_(courseRow_(p.courseCode));
}

/** บันทึกเนื้อหา (ไฟล์แนบจัดการแยกด้วยคำสั่งด้านล่าง) */
function apiSaveSyllabus_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  var cur = syllabusOf_(c);
  var inp = p.syllabus || {};
  Object.keys(SYLLABUS_TEXT_FIELDS).forEach(function (k) {
    if (inp[k] !== undefined) cur[k] = str_(inp[k], SYLLABUS_TEXT_FIELDS[k]);
  });
  if (Array.isArray(inp.weeks)) {
    cur.weeks = emptySyllabus_().weeks.map(function (blank, i) {
      var w = inp.weeks[i] || {};
      return { topic: str_(w.topic, 200), detail: str_(w.detail, 1000) };
    });
  }
  writeSyllabus_(c, cur);
  return syllabusView_(c);
}

function apiAddSyllabusLink_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  var s = syllabusOf_(c);
  if (s.attachments.length >= SYLLABUS_MAX_ATTACHMENTS) throw new Error('แนบได้สูงสุด ' + SYLLABUS_MAX_ATTACHMENTS + ' รายการ');
  var url = str_(p.url, 2000);
  if (!/^https:\/\/[^\s]+$/.test(url)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://');
  s.attachments.push({ id: uid_('L'), kind: 'link', name: str_(p.name, 200) || url, url: url });
  writeSyllabus_(c, s);
  return syllabusView_(c);
}

function apiStartSyllabusUpload_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  if (syllabusOf_(c).attachments.length >= SYLLABUS_MAX_ATTACHMENTS) throw new Error('แนบได้สูงสุด ' + SYLLABUS_MAX_ATTACHMENTS + ' รายการ');
  var size = Number(p.size);
  var maxMB = settingsView_().uploadMaxMB;
  if (!(size > 0)) throw new Error('ไฟล์ว่างเปล่า');
  if (size > maxMB * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน ' + maxMB + ' MB');
  var origin = String(p.origin || '').replace(/\/+$/, '');
  if (settingsView_().allowedOrigins.indexOf(origin) < 0) {
    throw new Error('เว็บไซต์ ' + origin + ' ไม่ได้รับอนุญาตให้อัปโหลด (ตั้งค่า allowedOrigins)');
  }
  return {
    uploadUrl: startResumable_({
      folderId: syllabusFolderId_(c.courseCode),
      name: safeName_(p.fileName),
      mimeType: String(p.mimeType || 'application/octet-stream'),
      size: size,
      origin: origin,
      description: 'Syllabus ' + c.courseCode,
      appProperties: { syllabusOf: c.courseCode }
    })
  };
}

function apiFinalizeSyllabusUpload_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  var f = getDriveFile_(String(p.fileId || ''));
  if (!f || f.trashed || (f.appProperties || {}).syllabusOf !== c.courseCode) throw new Error('ไม่พบไฟล์ที่อัปโหลด');
  var s = syllabusOf_(c);
  if (!s.attachments.some(function (x) { return x.id === f.id; })) {
    shareAnyoneReader_(f.id);
    s.attachments.push({ id: f.id, kind: 'file', name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType });
    writeSyllabus_(c, s);
  }
  return syllabusView_(c);
}

function apiRemoveSyllabusAttachment_(user, p) {
  requireTeacher_(user);
  var c = courseRow_(p.courseCode);
  var s = syllabusOf_(c);
  var hit = find_(s.attachments, function (x) { return x.id === p.id; });
  if (!hit) throw new Error('ไม่พบไฟล์แนบ');
  if (hit.kind === 'file') trashFile_(hit.id);
  s.attachments = s.attachments.filter(function (x) { return x !== hit; });
  writeSyllabus_(c, s);
  return syllabusView_(c);
}

// ===== server/Board.js =====
/*
 * Board — บอร์ดกลุ่ม: ป้ายของทุกกลุ่มในงานกลุ่ม + Kanban วางแผนงานของแต่ละกลุ่ม (ต้องทำ / กำลังทำ / เสร็จ)
 * แผนงานเห็นเฉพาะสมาชิกกลุ่มนั้น (แก้ไขได้) และอาจารย์ (ดูอย่างเดียว)
 * กลุ่มอื่นเห็นแค่ชื่อกลุ่มและสมาชิก
 */

var TASK_STATUS = ['todo', 'doing', 'done'];
var MAX_TASKS_PER_GROUP = 200;

function tasksOf_(groupId) {
  return rows_('Tasks').filter(function (t) { return t.groupId === groupId; });
}

function taskView_(t) {
  return {
    id: t.id, title: t.title, note: t.note, status: t.status, assignee: t.assignee, dueAt: t.dueAt,
    createdBy: t.createdBy, createdAt: t.createdAt, updatedAt: t.updatedAt
  };
}

/** ลบแผนงานของกลุ่มที่ไม่มีอยู่แล้ว — เรียกหลังลบกลุ่ม/งาน/วิชา */
function pruneTasks_() {
  var alive = {};
  rows_('Groups').forEach(function (g) { alive[g.id] = true; });
  remove_('Tasks', function (t) { return !alive[t.groupId]; });
}

function isMember_(user, g) {
  return user.role === 'student' && membersOf_(g).indexOf(user.studentId) >= 0;
}

function boardGroup_(user, groupId) {
  var g = groupRow_(groupId);
  var a = assignmentRow_(g.assignmentId);
  checkEnrolled_(user, a.courseCode);
  if (user.role !== 'teacher' && !isMember_(user, g)) throw new Error('ดูได้เฉพาะแผนงานของกลุ่มตัวเอง');
  return { g: g, a: a };
}

function taskCounts_(groupId) {
  var c = { todo: 0, doing: 0, done: 0 };
  tasksOf_(groupId).forEach(function (t) { if (c[t.status] !== undefined) c[t.status]++; });
  return c;
}

/** ป้ายของทุกกลุ่ม แยกตามงานกลุ่ม */
function apiBoardGroups_(user, p) {
  checkEnrolled_(user, p.courseCode);
  var teacher = user.role === 'teacher';
  if (!teacher) requireStudent_(user);
  return rows_('Assignments')
    .filter(function (a) { return a.courseCode === p.courseCode && isGroupWork_(a) && (teacher || a.published === 'true'); })
    .sort(byDue_)
    .map(function (a) {
      var groups = groupsOf_(a.id).map(function (g) {
        var v = groupView_(a, g);
        var mine = isMember_(user, g);
        return {
          id: g.id, name: g.name, members: v.members, mine: mine,
          submitted: !!(v.submission && v.submission.submittedAt),
          counts: mine || teacher ? taskCounts_(g.id) : null
        };
      });
      var grouped = {};
      groups.forEach(function (g) { g.members.forEach(function (m) { grouped[m.studentId] = true; }); });
      return {
        assignment: assignmentView_(a),
        groups: groups,
        ungrouped: rosterOf_(a.courseCode).filter(function (r) { return !grouped[r.studentId]; }).length
      };
    });
}

function apiGroupBoard_(user, p) {
  var x = boardGroup_(user, p.groupId);
  return {
    assignment: assignmentView_(x.a),
    group: groupView_(x.a, x.g),
    canEdit: isMember_(user, x.g),
    tasks: tasksOf_(x.g.id).map(taskView_)
  };
}

/** สร้าง (ไม่มี id) หรือแก้บางช่อง (มี id) — คืนบอร์ดทั้งกลุ่ม */
function apiSaveTask_(user, p) {
  requireStudent_(user);
  var x = boardGroup_(user, p.groupId);
  var t;
  if (p.id) {
    t = find_(tasksOf_(x.g.id), function (r) { return r.id === p.id; });
    if (!t) throw new Error('ไม่พบงานย่อยนี้');
  } else {
    if (tasksOf_(x.g.id).length >= MAX_TASKS_PER_GROUP) throw new Error('มีงานย่อยได้สูงสุด ' + MAX_TASKS_PER_GROUP + ' รายการต่อกลุ่ม');
    t = { id: uid_('T'), groupId: x.g.id, title: '', note: '', status: 'todo', assignee: '', dueAt: '', createdBy: user.studentId, createdAt: now_() };
  }
  if (p.title !== undefined) t.title = str_(p.title, 200);
  if (!t.title) throw new Error('กรุณาใส่ชื่องานย่อย');
  if (p.note !== undefined) t.note = str_(p.note, 2000);
  if (p.status !== undefined) {
    if (TASK_STATUS.indexOf(p.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
    t.status = p.status;
  }
  if (p.assignee !== undefined) {
    var who = str_(p.assignee, 20);
    if (who && membersOf_(x.g).indexOf(who) < 0) throw new Error('ผู้รับผิดชอบต้องเป็นสมาชิกกลุ่ม');
    t.assignee = who;
  }
  if (p.dueAt !== undefined) {
    if (p.dueAt && isNaN(new Date(p.dueAt).getTime())) throw new Error('วันกำหนดไม่ถูกต้อง');
    t.dueAt = p.dueAt ? new Date(p.dueAt).toISOString() : '';
  }
  t.updatedAt = now_();
  if (p.id) update_('Tasks', t); else insert_('Tasks', t);
  return apiGroupBoard_(user, { groupId: x.g.id });
}

function apiDeleteTask_(user, p) {
  requireStudent_(user);
  var x = boardGroup_(user, p.groupId);
  var n = remove_('Tasks', function (t) { return t.groupId === x.g.id && t.id === p.id; });
  if (!n) throw new Error('ไม่พบงานย่อยนี้');
  return apiGroupBoard_(user, { groupId: x.g.id });
}

// ===== server/Dashboard.js =====
/*
 * Dashboard — ภาพรวมของวิชา (อาจารย์ / นักศึกษา) และข้อมูล Timeline (Gantt)
 */

/** สถานะงานของนักศึกษา 1 คน: graded | submitted | late | missing | open */
function workStatus_(a, sub) {
  if (sub && sub.score !== null && sub.score !== undefined) return 'graded';
  if (sub && sub.submittedAt) return sub.isLate ? 'late' : 'submitted';
  return isPastDue_(a) ? 'missing' : 'open';
}

function publishedOf_(code) {
  return rows_('Assignments')
    .filter(function (a) { return a.courseCode === code && a.published === 'true'; })
    .sort(byDue_);
}

/** แผนงานในกลุ่มของนักศึกษาในวิชานี้ */
function myGroupTasks_(code, studentId) {
  var out = [];
  publishedOf_(code).forEach(function (a) {
    if (!isGroupWork_(a)) return;
    var g = groupOf_(a.id, studentId);
    if (!g) return;
    tasksOf_(g.id).forEach(function (t) {
      var v = taskView_(t);
      v.groupId = g.id;
      v.groupName = g.name;
      v.assignmentTitle = a.title;
      v.mine = t.assignee === studentId;
      out.push(v);
    });
  });
  return out;
}

/* ---------- Timeline ---------- */

function apiTimeline_(user, p) {
  checkEnrolled_(user, p.courseCode);
  var teacher = user.role === 'teacher';
  if (!teacher) requireStudent_(user);
  var list = teacher
    ? rows_('Assignments').filter(function (a) { return a.courseCode === p.courseCode; }).sort(byDue_)
    : publishedOf_(p.courseCode);
  var cards = teacher ? apiListAssignments_(user, { courseCode: p.courseCode }) : [];
  var items = list.map(function (a) {
    var v = assignmentView_(a);
    var item = {
      kind: 'assignment', id: a.id, title: a.title, start: a.createdAt || a.dueAt || now_(), end: a.dueAt,
      groupMax: v.groupMax, published: v.published, overdue: v.overdue
    };
    if (teacher) item.counts = find_(cards, function (c) { return c.id === a.id; }).counts;
    else item.status = workStatus_(a, mergedSubmission_(a, user.studentId));
    return item;
  });
  var tasks = teacher ? [] : myGroupTasks_(p.courseCode, user.studentId)
    .filter(function (t) { return t.dueAt; })
    .map(function (t) {
      return {
        kind: 'task', id: t.id, title: t.title, start: t.createdAt || t.dueAt, end: t.dueAt, status: t.status,
        mine: t.mine, groupId: t.groupId, groupName: t.groupName, assignmentTitle: t.assignmentTitle
      };
    });
  return { now: now_(), items: items, tasks: tasks };
}

/* ---------- Dashboard นักศึกษา ---------- */

function apiStudentDashboard_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  var d = courseData_(p.courseCode);
  var id = user.studentId;
  var result = computeFor_(d, id);
  var work = publishedOf_(p.courseCode).map(function (a) {
    var sub = mergedSubmission_(a, id);
    var v = assignmentView_(a);
    v.status = workStatus_(a, sub);
    v.score = sub ? sub.score : null;
    v.feedback = sub ? sub.feedback : '';
    v.gradedAt = sub ? sub.gradedAt : '';
    return v;
  });
  var count = function (st) { return work.filter(function (w) { return st.indexOf(w.status) >= 0; }).length; };
  var tasks = myGroupTasks_(p.courseCode, id)
    .filter(function (t) { return t.status !== 'done' && (t.mine || !t.assignee); })
    .sort(function (a, b) { return (a.dueAt || '9999') < (b.dueAt || '9999') ? -1 : 1; });
  var marks = d.att[id] || marksOf_(null);
  var held = d.course.heldWeeks;
  var tally = { P: 0, L: 0, E: 0, A: 0 };
  held.forEach(function (w) { if (tally[marks[w - 1]] !== undefined) tally[marks[w - 1]]++; });
  // ลาที่อนุมัติแล้วในสัปดาห์ที่ยังไม่เช็คชื่อ ก็นับด้วย
  marks.forEach(function (m, i) { if (m === 'E' && held.indexOf(i + 1) < 0) tally.E++; });
  return {
    course: d.course,
    todo: work.filter(function (w) { return w.status === 'open' || (w.status === 'missing' && w.allowLate); }).slice(0, 6),
    missing: work.filter(function (w) { return w.status === 'missing'; }).map(function (w) { return { id: w.id, title: w.title, dueAt: w.dueAt, allowLate: w.allowLate }; }),
    counts: { total: work.length, submitted: count(['submitted', 'late', 'graded']), graded: count(['graded']), missing: count(['missing']) },
    parts: result.parts,
    total: d.course.gradesVisible ? result.total : null,
    grade: d.course.gradesVisible ? result.grade : null,
    gradePending: d.course.gradesVisible && result.grade === null,
    attendance: { held: held.length, tally: tally, absence: result.absence },
    tasks: tasks.slice(0, 8),
    feedback: work
      .filter(function (w) { return w.status === 'graded'; })
      .sort(function (a, b) { return (a.gradedAt || '') > (b.gradedAt || '') ? -1 : 1; })
      .slice(0, 3)
      .map(function (w) { return { id: w.id, title: w.title, score: w.score, maxScore: w.maxScore, feedback: w.feedback, gradedAt: w.gradedAt }; })
  };
}

/* ---------- Dashboard อาจารย์ ---------- */

var AT_RISK_MISSING = 2;
var AT_RISK_ATTENDANCE = 80;

function apiTeacherDashboard_(user, p) {
  requireTeacher_(user);
  var d = courseData_(p.courseCode);
  var roster = rosterOf_(p.courseCode);
  var published = publishedOf_(p.courseCode);
  var cards = apiListAssignments_(user, { courseCode: p.courseCode });
  var grades = {};
  var attSum = 0, attN = 0;
  var students = roster.map(function (r) {
    var res = computeFor_(d, r.studentId);
    var missing = 0;
    var toGrade = 0;
    published.forEach(function (a) {
      var st = workStatus_(a, mergedSubmission_(a, r.studentId));
      if (st === 'missing') missing++;
      if (st === 'submitted' || st === 'late') toGrade++;
    });
    var att = res.parts.attendance.pct;
    if (att !== null) { attSum += att; attN++; }
    // ระหว่างเทอมใช้แนวโน้ม (คิดจากส่วนที่มีคะแนนแล้ว) — ยังไม่มีคะแนนเลย = ไม่นับ
    var g = res.grade || res.projectedGrade;
    grades[g || '-'] = (grades[g || '-'] || 0) + 1;
    return {
      studentId: r.studentId, name: r.name, registered: !!r.email, missing: missing, toGrade: toGrade,
      attendance: att, absence: res.absence, total: res.total, grade: res.grade
    };
  });
  // ขาดเกินเกณฑ์ (F) ขึ้นก่อน แล้วขาดมาก → ขาดส่งมาก → เข้าเรียนน้อย
  var risk = students
    .filter(function (s) {
      return s.absence.warn || s.missing >= AT_RISK_MISSING || (s.attendance !== null && s.attendance < AT_RISK_ATTENDANCE);
    })
    .sort(function (a, b) {
      return Number(b.absence.fail) - Number(a.absence.fail) || b.absence.effective - a.absence.effective ||
        b.missing - a.missing || (a.attendance === null ? 101 : a.attendance) - (b.attendance === null ? 101 : b.attendance);
    });
  var toGradeBy = {};
  published.forEach(function (a) {
    toGradeBy[a.id] = roster.filter(function (r) {
      var st = workStatus_(a, mergedSubmission_(a, r.studentId));
      return st === 'submitted' || st === 'late';
    }).length;
  });
  return {
    course: d.course,
    counts: {
      students: roster.length,
      registered: roster.filter(function (r) { return r.email; }).length,
      assignments: published.length,
      hidden: cards.length - published.length,
      toGrade: students.reduce(function (n, s) { return n + s.toGrade; }, 0),
      heldWeeks: d.course.heldWeeks.length,
      pendingLeaves: pendingLeaves_(p.courseCode)
    },
    attendanceAvg: attN ? Grade.round2(attSum / attN) : null,
    assignments: cards.filter(function (c) { return c.published; }).map(function (c) {
      c.toGrade = toGradeBy[c.id] || 0;
      return c;
    }),
    atRisk: {
      total: risk.length, list: risk.slice(0, 10), missingLimit: AT_RISK_MISSING, attendanceLimit: AT_RISK_ATTENDANCE,
      failedByAbsence: students.filter(function (s) { return s.absence.fail; }).length, rules: d.settings.attendanceRules
    },
    grades: d.settings.gradeCutoffs.map(function (g) { return { grade: g[0], count: grades[g[0]] || 0 }; }),
    noScores: grades['-'] || 0
  };
}

// ===== server/Leave.js =====
/*
 * Leave — ใบลา: นักศึกษาส่งใบลารายสัปดาห์ (แนบไฟล์ได้ เช่น ใบรับรองแพทย์) → อาจารย์อนุมัติ/ไม่อนุมัติ
 * อนุมัติ = ทำเครื่องหมาย "ลา" (E) ในการเช็คชื่อสัปดาห์นั้นให้อัตโนมัติ (ยกเว้นเช็คว่า "มา" ไว้แล้ว)
 * เปลี่ยนจากอนุมัติเป็นไม่อนุมัติ = คืนเครื่องหมายเดิม
 */

var LEAVE_TYPES = { sick: 'ลาป่วย', personal: 'ลากิจ', other: 'อื่นๆ' };
var LEAVE_STATUS = ['pending', 'approved', 'rejected'];
var LEAVE_MAX_FILES = 5;
var LEAVE_MAX_MB = 20;

function leaveRow_(id) {
  var r = find_(rows_('LeaveRequests'), function (x) { return x.id === id; });
  if (!r) throw new Error('ไม่พบใบลานี้');
  return r;
}

function leaveView_(r) {
  var st = studentRow_(r.courseCode, r.studentId);
  return {
    id: r.id, courseCode: r.courseCode, studentId: r.studentId, name: st ? st.name : '',
    week: Number(r.week), date: r.date, type: r.type, typeLabel: LEAVE_TYPES[r.type] || r.type,
    reason: r.reason, files: parseJson_(r.files, []), status: r.status, note: r.note,
    submittedAt: r.submittedAt, decidedAt: r.decidedAt
  };
}

function myLeave_(user, id) {
  requireStudent_(user);
  var r = leaveRow_(id);
  if (r.studentId !== user.studentId) throw new Error('ไม่พบใบลานี้');
  checkEnrolled_(user, r.courseCode);
  return r;
}

function byNewest_(a, b) {
  return a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0;
}

function pendingLeaves_(code) {
  return rows_('LeaveRequests').filter(function (r) { return r.courseCode === code && r.status === 'pending'; }).length;
}

/* ---------- นักศึกษา ---------- */

function apiMyLeaves_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  return rows_('LeaveRequests')
    .filter(function (r) { return r.courseCode === p.courseCode && r.studentId === user.studentId; })
    .sort(byNewest_)
    .map(leaveView_);
}

function apiSubmitLeave_(user, p) {
  requireStudent_(user);
  checkEnrolled_(user, p.courseCode);
  var week = Number(p.week);
  if (!(week >= 1 && week <= Grade.WEEKS && week === Math.floor(week))) throw new Error('กรุณาเลือกสัปดาห์ 1–' + Grade.WEEKS);
  var date = str_(p.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) throw new Error('กรุณาเลือกวันที่ลา');
  if (!LEAVE_TYPES[p.type]) throw new Error('กรุณาเลือกประเภทการลา');
  var reason = str_(p.reason, 1000);
  if (!reason) throw new Error('กรุณาใส่เหตุผลการลา');
  var dup = find_(rows_('LeaveRequests'), function (r) {
    return r.courseCode === p.courseCode && r.studentId === user.studentId && Number(r.week) === week && r.status !== 'rejected';
  });
  if (dup) throw new Error('มีใบลาสัปดาห์ที่ ' + week + ' อยู่แล้ว');
  var r = {
    id: uid_('V'), courseCode: p.courseCode, studentId: user.studentId, week: String(week), date: date,
    type: p.type, reason: reason, files: '[]', status: 'pending', note: '', submittedAt: now_(), decidedAt: '', prevMark: ''
  };
  insert_('LeaveRequests', r);
  return leaveView_(r);
}

function apiStartLeaveUpload_(user, p) {
  var r = myLeave_(user, p.leaveId);
  if (r.status !== 'pending') throw new Error('ใบลานี้พิจารณาแล้ว แนบไฟล์เพิ่มไม่ได้');
  if (parseJson_(r.files, []).length >= LEAVE_MAX_FILES) throw new Error('แนบได้สูงสุด ' + LEAVE_MAX_FILES + ' ไฟล์');
  var size = Number(p.size);
  if (!(size > 0)) throw new Error('ไฟล์ว่างเปล่า');
  if (size > LEAVE_MAX_MB * 1024 * 1024) throw new Error('ไฟล์แนบใบลาต้องไม่เกิน ' + LEAVE_MAX_MB + ' MB');
  var origin = String(p.origin || '').replace(/\/+$/, '');
  if (settingsView_().allowedOrigins.indexOf(origin) < 0) {
    throw new Error('เว็บไซต์ ' + origin + ' ไม่ได้รับอนุญาตให้อัปโหลด (ตั้งค่า allowedOrigins)');
  }
  var st = studentRow_(r.courseCode, r.studentId);
  return {
    uploadUrl: startResumable_({
      folderId: leaveFolderId_(r.courseCode, st.studentId + ' ' + st.name),
      name: safeName_('สัปดาห์ ' + r.week + ' - ' + p.fileName),
      mimeType: String(p.mimeType || 'application/octet-stream'),
      size: size,
      origin: origin,
      description: 'ใบลา ' + st.name + ' (' + st.studentId + ') สัปดาห์ ' + r.week,
      appProperties: { leaveId: r.id, studentId: r.studentId }
    })
  };
}

function apiFinalizeLeaveUpload_(user, p) {
  var r = myLeave_(user, p.leaveId);
  var f = getDriveFile_(String(p.fileId || ''));
  var props = (f && f.appProperties) || {};
  if (!f || f.trashed || props.leaveId !== r.id || props.studentId !== user.studentId) throw new Error('ไม่พบไฟล์ที่อัปโหลด');
  var files = parseJson_(r.files, []);
  if (!files.some(function (x) { return x.id === f.id; })) {
    shareReader_(f.id, user.email);
    files.push({ id: f.id, name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType });
    r.files = JSON.stringify(files);
    update_('LeaveRequests', r);
  }
  return leaveView_(r);
}

/** ยกเลิกใบลาที่ยังไม่ได้พิจารณา — ไฟล์แนบย้ายไปถังขยะ */
function apiCancelLeave_(user, p) {
  var r = myLeave_(user, p.leaveId);
  if (r.status !== 'pending') throw new Error('ใบลานี้พิจารณาแล้ว ยกเลิกไม่ได้ (ติดต่ออาจารย์)');
  parseJson_(r.files, []).forEach(function (f) { trashFile_(f.id); });
  remove_('LeaveRequests', function (x) { return x.id === r.id; });
  return { cancelled: r.id };
}

/* ---------- อาจารย์ ---------- */

function apiListLeaves_(user, p) {
  requireTeacher_(user);
  courseRow_(p.courseCode);
  return rows_('LeaveRequests')
    .filter(function (r) { return r.courseCode === p.courseCode; })
    .sort(function (a, b) {
      // รออนุมัติขึ้นก่อน แล้วเรียงใหม่ → เก่า
      var pa = a.status === 'pending' ? 0 : 1, pb = b.status === 'pending' ? 0 : 1;
      return pa - pb || byNewest_(a, b);
    })
    .map(leaveView_);
}

/** status: approved | rejected | pending — อนุมัติแล้วเปลี่ยนใจได้ */
function apiDecideLeave_(user, p) {
  requireTeacher_(user);
  var r = leaveRow_(p.leaveId);
  if (LEAVE_STATUS.indexOf(p.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  var att = find_(rows_('Attendance'), function (x) { return x.courseCode === r.courseCode && x.studentId === r.studentId; });
  var key = 'w' + r.week;
  if (p.status === 'approved' && r.status !== 'approved') {
    if (!att) {
      att = { courseCode: r.courseCode, studentId: r.studentId };
      for (var w = 1; w <= Grade.WEEKS; w++) att['w' + w] = '';
      rows_('Attendance').push(att);
    }
    r.prevMark = att[key] || '';
    if (att[key] !== 'P') att[key] = 'E';
  } else if (p.status !== 'approved' && r.status === 'approved' && att && att[key] === 'E') {
    att[key] = r.prevMark || '';
  }
  // ไม่แตะ heldWeeks: สัปดาห์ที่มีแค่ "ลา" ยังไม่นับว่าเช็คชื่อแล้ว (ดู apiSaveAttendance_)
  if (att) saveAll_('Attendance');
  r.status = p.status;
  r.note = str_(p.note, 1000);
  r.decidedAt = p.status === 'pending' ? '' : now_();
  update_('LeaveRequests', r);
  return leaveView_(r);
}

// ===== server/Setup.js =====
/*
 * Setup — รันครั้งเดียวจากตัวแก้ไข Apps Script (เลือกฟังก์ชัน setup แล้วกด Run)
 * สร้างแท็บทั้งหมด, ค่าตั้งต้นใน Settings และโฟลเดอร์เก็บงานใน Drive
 * รันซ้ำได้ — จะไม่ลบข้อมูลเดิม
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ต้องเปิด Apps Script จากเมนู ส่วนขยาย > Apps Script ของ Google Sheet');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      sh.setFrozenRows(1);
    } else {
      // เวอร์ชันใหม่เพิ่มคอลัมน์ → เติมหัวคอลัมน์ที่ขาดต่อท้าย
      var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      var missing = cols.filter(function (c) { return header.indexOf(c) < 0; });
      if (missing.length) sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
    sh.getRange(1, 1, sh.getMaxRows(), sh.getLastColumn()).setNumberFormat('@');
  });

  ss.getSheets().forEach(function (sh) {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  resetCache_();
  var me = Session.getEffectiveUser().getEmail();
  var defaults = {
    teacherEmails: me,
    allowedDomains: 'cmru.ac.th',
    allowedOrigins: 'https://robinrood.github.io',
    clientId: '',
    rootFolderId: '',
    gradeCutoffs: JSON.stringify(Grade.DEFAULT_CUTOFFS),
    attendancePoints: JSON.stringify(Grade.DEFAULT_ATTENDANCE_POINTS),
    uploadMaxMB: '2048'
  };
  var have = settings_();
  if (!have.rootFolderId) defaults.rootFolderId = DriveApp.createFolder('CMRUScoreSaver งานนักศึกษา').getId();
  Object.keys(defaults).forEach(function (k) {
    if (have[k] === undefined) insert_('Settings', { key: k, value: defaults[k] });
    else if ((k === 'rootFolderId' || k === 'allowedDomains') && !have[k]) {
      var r = find_(rows_('Settings'), function (x) { return x.key === k; });
      r.value = defaults[k];
      update_('Settings', r);
    }
  });

  Logger.log('ตั้งค่าเสร็จแล้ว — ต่อไป: ใส่ clientId และ allowedDomains (โดเมนอีเมลมหาวิทยาลัย) ในแท็บ Settings แล้ว Deploy เป็น Web app');
}
