// ไฟล์นี้สร้างอัตโนมัติจาก server/*.js และ js/grade.js — อย่าแก้ที่นี่ ให้แก้ไฟล์ต้นทางแล้วรัน node scripts/build-gas.mjs

// ===== js/grade.js =====
/*
 * Grade — คำนวณคะแนนรวมและเกรด
 * ไฟล์นี้ใช้ร่วมกัน 3 ที่: เบราว์เซอร์ (window.Grade), Node tests, และ Apps Script (ถูกรวมเข้า dist/Code.gs)
 * จึงเขียนเป็น JavaScript ธรรมดา ไม่ใช้ import/export
 */
var Grade = (function () {
  var DEFAULT_WEIGHTS = { attendance: 10, assignments: 50, midterm: 20, final: 20 };
  var DEFAULT_CUTOFFS = [['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['D+', 55], ['D', 50], ['F', 0]];
  // P = มา, L = สาย, E = ลา, A = ขาด
  var DEFAULT_ATTENDANCE_POINTS = { P: 1, L: 0.5, E: 1, A: 0 };
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

  /** marks: array ยาว 16 (index 0 = สัปดาห์ 1), heldWeeks: สัปดาห์ที่มีการเช็คชื่อแล้ว (เลข 1–16) */
  function attendance(marks, heldWeeks, points) {
    points = points || DEFAULT_ATTENDANCE_POINTS;
    var held = (heldWeeks || []).filter(function (w) { return w >= 1 && w <= WEEKS; });
    if (!held.length) return { held: 0, earned: 0, pct: null };
    var earned = 0;
    held.forEach(function (w) {
      var m = (marks || [])[w - 1] || 'A'; // สัปดาห์ที่เช็คแล้วแต่ไม่มีบันทึก = ขาด
      earned += num(points[m]) || 0;
    });
    return { held: held.length, earned: earned, pct: round2((earned / held.length) * 100) };
  }

  /** items: [{score, maxScore, overdue}] — นับงานที่ให้คะแนนแล้ว หรือเลยกำหนดส่งแล้ว (ไม่ส่ง = 0) */
  function assignments(items) {
    var got = 0, max = 0, counted = 0;
    (items || []).forEach(function (it) {
      var s = num(it.score), m = num(it.maxScore);
      if (!m || m <= 0) return;
      if (s === null && !it.overdue) return;
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
   * input: { weights, cutoffs, attendancePoints, heldWeeks, attendance (marks),
   *          assignments: [{score,maxScore,overdue}], midterm, maxMidterm, final, maxFinal }
   * คืน: { parts: {attendance, assignments, midterm, final}, total, grade }
   * ส่วนที่ยังไม่มีคะแนน (pct = null) นับเป็น 0 ในคะแนนรวม
   */
  function compute(input) {
    var w = input.weights || DEFAULT_WEIGHTS;
    var parts = {
      attendance: attendance(input.attendance, input.heldWeeks, input.attendancePoints),
      assignments: assignments(input.assignments),
      midterm: exam(input.midterm, input.maxMidterm),
      final: exam(input.final, input.maxFinal)
    };
    var total = 0;
    PARTS.forEach(function (k) {
      var weight = num(w[k]) || 0;
      var pct = parts[k].pct;
      parts[k].weight = weight;
      parts[k].points = pct === null ? null : round2((pct / 100) * weight);
      total += parts[k].points || 0;
    });
    total = round2(total);
    return { parts: parts, total: total, grade: letter(total, input.cutoffs) };
  }

  return {
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    DEFAULT_CUTOFFS: DEFAULT_CUTOFFS,
    DEFAULT_ATTENDANCE_POINTS: DEFAULT_ATTENDANCE_POINTS,
    WEEKS: WEEKS,
    PARTS: PARTS,
    num: num,
    round2: round2,
    attendance: attendance,
    assignments: assignments,
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
  saveAttendance: 1, saveExams: 1, updateCourse: 1, updateSettings: 1,
  setStudentEmail: 1, addStudent: 1, removeStudent: 1
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
    'weights', 'maxMidterm', 'maxFinal', 'gradesVisible', 'heldWeeks'],
  Students: ['courseCode', 'studentId', 'name', 'group', 'email', 'boundAt', 'nickname', 'phone'],
  Assignments: ['id', 'courseCode', 'title', 'description', 'maxScore', 'dueAt', 'allowLate', 'published', 'createdAt'],
  Submissions: ['id', 'assignmentId', 'studentId', 'files', 'link', 'submittedAt', 'isLate', 'score', 'feedback', 'gradedAt'],
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

function insert_(name, obj) {
  var t = table_(name);
  t.sheet.appendRow(toArray_(t, obj));
  obj._row = t.sheet.getLastRow();
  t.rows.push(obj);
  return obj;
}

function update_(name, obj) {
  var t = table_(name);
  if (!obj._row) return insert_(name, obj);
  t.sheet.getRange(obj._row, 1, 1, t.headers.length).setValues([toArray_(t, obj)]);
  return obj;
}

/** เขียนทั้งตารางจาก rows_(name) — ใช้ตอนแก้หลายแถวพร้อมกัน (เร็วกว่าเขียนทีละแถว) */
function saveAll_(name) {
  var t = table_(name);
  var sh = t.sheet;
  var data = t.rows.map(function (r) { return toArray_(t, r); });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, t.headers.length).clearContent();
  if (data.length) sh.getRange(2, 1, data.length, t.headers.length).setValues(data);
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
    // นักศึกษา
    myAssignments: apiMyAssignments_,
    myGrades: apiMyGrades_,
    startUpload: apiStartUpload_,
    finalizeUpload: apiFinalizeUpload_,
    submitLink: apiSubmitLink_,
    removeFile: apiRemoveFile_,
    // อาจารย์
    importRoster: apiImportRoster_,
    listStudents: apiListStudents_,
    setStudentEmail: apiSetStudentEmail_,
    addStudent: apiAddStudent_,
    removeStudent: apiRemoveStudent_,
    listAssignments: apiListAssignments_,
    upsertAssignment: apiUpsertAssignment_,
    deleteAssignment: apiDeleteAssignment_,
    listSubmissions: apiListSubmissions_,
    saveGrades: apiSaveGrades_,
    getAttendance: apiGetAttendance_,
    saveAttendance: apiSaveAttendance_,
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
    submittedAt: '', isLate: '', score: '', feedback: '', gradedAt: ''
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
    uploadMaxMB: Number(s.uploadMaxMB) || 2048
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
    heldWeeks: d.course.heldWeeks,
    attendance: d.att[studentId] || marksOf_(null),
    assignments: d.assignments.map(function (a) {
      var sub = d.subs[a.id + '|' + studentId];
      return { score: sub ? sub.score : null, maxScore: a.maxScore, overdue: a.overdue };
    }),
    midterm: ex.midterm,
    maxMidterm: d.course.maxMidterm,
    final: ex.final,
    maxFinal: d.course.maxFinal
  });
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
  var hit = rateLimit_('reg_' + user.email, 5, 3600, 'กรอกข้อมูลไม่ถูกต้องหลายครั้งเกินไป กรุณารอ 1 ชั่วโมง หรือติดต่ออาจารย์');

  var id = str_(p.studentId, 20);
  var first = str_(p.firstName, 100), last = str_(p.lastName, 100);
  if (!/^\d{8,13}$/.test(id)) throw new Error('รหัสนักศึกษาต้องเป็นตัวเลข 8–13 หลัก');
  if (!first || !last) throw new Error('กรุณากรอกชื่อและนามสกุล');
  var phone = str_(p.phone, 20).replace(/[\s-]/g, '');
  if (phone && !/^\+?\d{9,12}$/.test(phone)) throw new Error('เบอร์โทรไม่ถูกต้อง');

  var rows = rows_('Students').filter(function (r) { return r.studentId === id; });
  if (!rows.length) {
    hit();
    throw new Error('ไม่พบรหัส ' + id + ' ในรายชื่อลงทะเบียน — ตรวจรหัสอีกครั้ง หรือติดต่ออาจารย์');
  }
  if (normalizeName_(rows[0].name) !== normalizeName_(first + last)) {
    hit();
    throw new Error('ชื่อ-นามสกุลไม่ตรงกับรายชื่อลงทะเบียนของรหัสนี้ (กรอกตามใบรายชื่อของมหาวิทยาลัย ไม่ต้องใส่คำนำหน้า)');
  }
  if (rows.some(function (r) { return r.email && r.email.toLowerCase() !== user.email; })) {
    throw new Error('รหัสนี้ถูกสมัครด้วยบัญชีอื่นแล้ว กรุณาติดต่ออาจารย์');
  }
  bindRows_(rows, user.email, { nickname: str_(p.nickname, 50), phone: phone });
  user.studentId = id;
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
      v.submission = submissionView_(submissionRow_(a.id, user.studentId));
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
      return {
        id: a.id, title: a.title, maxScore: a.maxScore, dueAt: a.dueAt, overdue: a.overdue,
        submitted: !!(s && s.submittedAt), score: s ? s.score : null, feedback: s ? s.feedback : ''
      };
    }),
    attendance: { marks: d.att[id] || marksOf_(null), heldWeeks: d.course.heldWeeks },
    exams: { midterm: ex.midterm, final: ex.final, maxMidterm: d.course.maxMidterm, maxFinal: d.course.maxFinal },
    parts: result.parts,
    total: d.course.gradesVisible ? result.total : null,
    grade: d.course.gradesVisible ? result.grade : null
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

function apiRemoveStudent_(user, p) {
  requireTeacher_(user);
  var n = remove_('Students', function (r) { return r.courseCode === p.courseCode && r.studentId === p.studentId; });
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
        submitted: mine.filter(function (s) { return s.submittedAt; }).length,
        graded: mine.filter(function (s) { return s.score !== ''; }).length
      };
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

  var a = p.id ? assignmentRow_(p.id) : { id: uid_('A'), courseCode: p.courseCode, createdAt: now_() };
  a.title = title;
  a.description = str_(p.description, 5000);
  a.maxScore = String(max);
  a.dueAt = p.dueAt ? new Date(p.dueAt).toISOString() : '';
  a.allowLate = p.allowLate ? 'true' : 'false';
  a.published = p.published ? 'true' : 'false';
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
  remove_('Assignments', function (a) { return a.id === p.id; });
  return { deleted: p.id };
}

function apiListSubmissions_(user, p) {
  requireTeacher_(user);
  var a = assignmentRow_(p.assignmentId);
  return {
    assignment: assignmentView_(a),
    rows: rosterOf_(a.courseCode).map(function (r) {
      var v = studentView_(r);
      v.submission = submissionView_(submissionRow_(a.id, r.studentId));
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
  var held = {};
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
  rows.forEach(function (r) {
    if (r.courseCode !== p.courseCode) return;
    for (var w = 1; w <= Grade.WEEKS; w++) if (r['w' + w]) held[w] = true;
  });
  saveAll_('Attendance');
  course.heldWeeks = JSON.stringify(Object.keys(held).map(Number).sort(function (a, b) { return a - b; }));
  update_('Courses', course);
  return apiGetAttendance_(user, p);
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
      d.assignments.forEach(function (a) {
        var s = d.subs[a.id + '|' + r.studentId];
        v.scores[a.id] = s ? s.score : null;
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

function checkCanSubmit_(a, sub) {
  if (a.published !== 'true') throw new Error('งานนี้ยังไม่เปิดให้ส่ง');
  if (sub && sub.score !== '') throw new Error('งานนี้ตรวจให้คะแนนแล้ว แก้ไขไม่ได้ (ติดต่ออาจารย์)');
  if (isPastDue_(a) && a.allowLate !== 'true') throw new Error('เลยกำหนดส่งแล้ว');
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
  var sub = submissionRow_(a.id, user.studentId);
  checkCanSubmit_(a, sub);
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
  var folderId = submissionFolderId_(a, st);
  var uploadUrl = startResumable_({
    folderId: folderId,
    name: safeName_(p.fileName),
    mimeType: String(p.mimeType || 'application/octet-stream'),
    size: size,
    origin: origin,
    description: 'ส่งโดย ' + st.name + ' (' + st.studentId + ') ' + user.email,
    appProperties: { assignmentId: a.id, studentId: user.studentId }
  });
  return { uploadUrl: uploadUrl };
}

function apiFinalizeUpload_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var f = getDriveFile_(String(p.fileId || ''));
  var props = (f && f.appProperties) || {};
  if (!f || f.trashed || props.studentId !== user.studentId || props.assignmentId !== a.id) {
    throw new Error('ไม่พบไฟล์ที่อัปโหลด');
  }
  var sub = submissionRow_(a.id, user.studentId) || newSubmission_(a.id, user.studentId);
  var files = parseJson_(sub.files, []);
  if (!files.some(function (x) { return x.id === f.id; })) {
    shareReader_(f.id, user.email);
    files.push({ id: f.id, name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType });
  }
  markSubmitted_(a, sub, files);
  return submissionView_(sub);
}

function apiSubmitLink_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var sub = submissionRow_(a.id, user.studentId);
  checkCanSubmit_(a, sub);
  var link = str_(p.link, 2000);
  if (link && !/^https:\/\/[^\s]+$/.test(link)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://');
  sub = sub || newSubmission_(a.id, user.studentId);
  sub.link = link;
  markSubmitted_(a, sub, parseJson_(sub.files, []));
  return submissionView_(sub);
}

function apiRemoveFile_(user, p) {
  requireStudent_(user);
  var a = assignmentRow_(p.assignmentId);
  checkEnrolled_(user, a.courseCode);
  var sub = submissionRow_(a.id, user.studentId);
  checkCanSubmit_(a, sub);
  var files = sub ? parseJson_(sub.files, []) : [];
  var keep = files.filter(function (x) { return x.id !== p.fileId; });
  if (keep.length === files.length) throw new Error('ไม่พบไฟล์');
  trashFile_(p.fileId);
  markSubmitted_(a, sub, keep);
  return submissionView_(sub);
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

/** โฟลเดอร์: <root>/<รหัสวิชา>/<งาน>/<รหัส ชื่อ> — จำ id ไว้ใน Script Properties */
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

function submissionFolderId_(a, st) {
  var root = settings_().rootFolderId;
  if (!root) throw new Error('ยังไม่ได้ตั้งค่า rootFolderId — รัน setup()');
  var course = ensureFolder_(root, a.courseCode);
  var work = ensureFolder_(course, safeName_(a.title + ' [' + a.id + ']'));
  return ensureFolder_(work, safeName_(st.studentId + ' ' + st.name));
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
    allowedDomains: '',
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
    else if (k === 'rootFolderId' && !have[k]) {
      var r = find_(rows_('Settings'), function (x) { return x.key === k; });
      r.value = defaults[k];
      update_('Settings', r);
    }
  });

  Logger.log('ตั้งค่าเสร็จแล้ว — ต่อไป: ใส่ clientId และ allowedDomains (โดเมนอีเมลมหาวิทยาลัย) ในแท็บ Settings แล้ว Deploy เป็น Web app');
}
